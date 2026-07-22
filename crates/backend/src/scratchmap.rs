use h3o::{CellIndex, LatLng, Resolution};
use serde::Deserialize;
use worker::*;

const KV_BINDING: &str = "SCRATCHMAP";

// Where the previous fix (cell + timestamp) is remembered, so consecutive fixes can
// be connected. Prefixed with `_` so it's easy to exclude from the cell listing.
const LAST_KEY: &str = "__last";

// Line-fill guards: connect two fixes only if they're plausibly one continuous walk.
const MAX_HEX_GAP: i32 = 80; // ~3.5 km — bridge walks/short drives, skip teleports
const MAX_TIME_GAP: i64 = 600; // seconds — skip gaps where tracking was paused/closed

/// A location report. OwnTracks location messages use `lat`/`lon` (+ `tst`, a unix
/// timestamp); a plain `{"lat":..,"lon":..}` body works too.
#[derive(Deserialize)]
struct LocationPayload {
    lat: f64,
    lon: f64,
    #[serde(default)]
    tst: Option<i64>,
}

/// Shared-secret check for the phone (`?token=`) and CI (`Authorization: Bearer …`).
/// This is separate from the cookie auth used by the admin UI.
fn check_token(req: &Request, env: &Env) -> bool {
    let Ok(expected) = env.secret("SCRATCHMAP_TOKEN") else {
        return false;
    };
    let expected = expected.to_string();

    if let Ok(url) = req.url() {
        if let Some(query) = url.query() {
            for pair in query.split('&') {
                if let Some(value) = pair.strip_prefix("token=") {
                    if value == expected {
                        return true;
                    }
                }
            }
        }
    }

    if let Ok(Some(auth)) = req.headers().get("authorization") {
        if auth.strip_prefix("Bearer ") == Some(expected.as_str()) {
            return true;
        }
    }

    false
}

/// Record a cell, writing only if it's new. Most fixes land in already-seen hexes, so
/// this keeps KV writes (the scarce quota) near zero and spends reads instead.
async fn store_cell(store: &kv::KvStore, cell: CellIndex) -> Result<()> {
    let key = cell.to_string();
    if store.get(&key).text().await?.is_none() {
        store.put(&key, "1")?.execute().await?;
    }
    Ok(())
}

/// Parse the `"<cell>,<tst>"` value stored under `LAST_KEY`.
fn parse_last(raw: &str) -> Option<(CellIndex, i64)> {
    let (cell, tst) = raw.split_once(',')?;
    Some((cell.parse().ok()?, tst.parse().ok()?))
}

/// POST /scratchmap — reduce a location to its H3 res-11 cell and record it, plus every
/// hex along the straight line from the previous fix (so sparse GPS still paints a
/// continuous trail). Raw coordinates are never stored.
pub async fn ingest_location(req: &mut Request, env: &Env) -> Result<Response> {
    if !check_token(req, env) {
        return Response::error("Unauthorized", 401);
    }

    let body = req.text().await?;
    let payload: LocationPayload = match serde_json::from_str(&body) {
        Ok(payload) => payload,
        // OwnTracks also sends non-location messages (transitions, waypoints, …).
        // They carry no coordinates, so just acknowledge and ignore them.
        Err(_) => return Response::from_json(&serde_json::json!([])),
    };

    let cell = match LatLng::new(payload.lat, payload.lon) {
        Ok(coord) => coord.to_cell(Resolution::Eleven),
        Err(_) => return Response::error("Invalid coordinates", 400),
    };

    let now = payload
        .tst
        .unwrap_or_else(|| (Date::now().as_millis() / 1000) as i64);
    let store = env.kv(KV_BINDING)?;

    let last = match store.get(LAST_KEY).text().await {
        Ok(Some(raw)) => parse_last(&raw),
        _ => None,
    };

    // Still in the same 50 m cell as the previous fix → already recorded, so write
    // nothing. This is the common case for frequent pings (stationary or slow), and
    // skipping it keeps KV *writes* — the scarce free-tier quota — down to roughly one
    // per cell you actually move into.
    if last.map(|(last_cell, _)| last_cell) == Some(cell) {
        return Response::from_json(&serde_json::json!([]));
    }

    // Bridge the gap from the previous fix — but only if it looks like one continuous
    // stretch (close enough, recent enough), never across a drive/flight/app restart.
    if let Some((last_cell, last_tst)) = last {
        let dt = now - last_tst;
        if (0..=MAX_TIME_GAP).contains(&dt) {
            if let Ok(distance) = last_cell.grid_distance(cell) {
                if distance > 1 && distance <= MAX_HEX_GAP {
                    if let Ok(path) = last_cell.grid_path_cells(cell) {
                        for step in path.flatten() {
                            store_cell(&store, step).await?;
                        }
                    }
                }
            }
        }
    }

    store_cell(&store, cell).await?;
    store
        .put(LAST_KEY, format!("{cell},{now}"))?
        .execute()
        .await?;

    // OwnTracks expects a JSON array response (friends / commands); empty is fine.
    Response::from_json(&serde_json::json!([]))
}

/// GET /scratchmap/cells — the full sorted list of visited cell IDs. Used by CI only.
pub async fn list_cells(req: &Request, env: &Env) -> Result<Response> {
    if !check_token(req, env) {
        return Response::error("Unauthorized", 401);
    }

    let kv = env.kv(KV_BINDING)?;
    let mut names = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut builder = kv.list();
        if let Some(cursor) = cursor.take() {
            builder = builder.cursor(cursor);
        }
        let result = builder.execute().await?;
        for key in result.keys {
            // Skip bookkeeping keys like `__last`; only H3 cell ids are cells.
            if key.name.starts_with('_') {
                continue;
            }
            names.push(key.name);
        }
        if result.list_complete {
            break;
        }
        cursor = result.cursor;
        if cursor.is_none() {
            break;
        }
    }

    names.sort();
    Response::from_json(&names)
}
