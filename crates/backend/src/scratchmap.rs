use h3o::{CellIndex, LatLng, Resolution};
use serde::Deserialize;
use worker::*;

const D1_BINDING: &str = "SCRATCHMAP_DB";

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

#[derive(Deserialize)]
struct CellRow {
    id: String,
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

/// Parse the `"<cell>,<tst>"` value stored under `meta.last`.
fn parse_last(raw: &str) -> Option<(CellIndex, i64)> {
    let (cell, tst) = raw.split_once(',')?;
    Some((cell.parse().ok()?, tst.parse().ok()?))
}

/// POST /scratchmap — reduce a location to its H3 res-11 cell and record it, plus every
/// hex along the straight line from the previous fix (so sparse GPS still paints a
/// continuous trail). Raw coordinates are never stored.
///
/// Stored in D1: `INSERT OR IGNORE` dedups cells server-side (no read-before-write), and
/// re-visiting a known cell writes nothing — so writes track only newly discovered hexes.
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
    let db = env.d1(D1_BINDING)?;

    let last_raw: Option<String> = db
        .prepare("SELECT value FROM meta WHERE key = 'last'")
        .first(Some("value"))
        .await?;
    let last = last_raw.as_deref().and_then(parse_last);

    // Still in the same 50 m cell as the previous fix → already recorded, nothing to do.
    if last.map(|(last_cell, _)| last_cell) == Some(cell) {
        return Response::from_json(&serde_json::json!([]));
    }

    // Gather the cells to record: the current one, plus the straight line from the
    // previous fix — but only if it looks like one continuous stretch (close enough,
    // recent enough), never across a drive/flight/app restart.
    let mut cells = Vec::new();
    if let Some((last_cell, last_tst)) = last {
        let dt = now - last_tst;
        if (0..=MAX_TIME_GAP).contains(&dt) {
            if let Ok(distance) = last_cell.grid_distance(cell) {
                if distance > 1 && distance <= MAX_HEX_GAP {
                    if let Ok(path) = last_cell.grid_path_cells(cell) {
                        cells.extend(path.flatten());
                    }
                }
            }
        }
    }
    cells.push(cell);

    // One atomic batch: record every cell (dedup via INSERT OR IGNORE) and move `last`.
    let mut statements = Vec::with_capacity(cells.len() + 1);
    for cell in &cells {
        statements.push(
            db.prepare("INSERT OR IGNORE INTO cells (id) VALUES (?1)")
                .bind(&[cell.to_string().into()])?,
        );
    }
    statements.push(
        db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last', ?1)")
            .bind(&[format!("{cell},{now}").into()])?,
    );
    db.batch(statements).await?;

    // OwnTracks expects a JSON array response (friends / commands); empty is fine.
    Response::from_json(&serde_json::json!([]))
}

/// GET /scratchmap/cells — the full sorted list of visited cell IDs. Used by CI only.
pub async fn list_cells(req: &Request, env: &Env) -> Result<Response> {
    if !check_token(req, env) {
        return Response::error("Unauthorized", 401);
    }

    let db = env.d1(D1_BINDING)?;
    let result = db.prepare("SELECT id FROM cells ORDER BY id").all().await?;
    let names: Vec<String> = result
        .results::<CellRow>()?
        .into_iter()
        .map(|row| row.id)
        .collect();

    Response::from_json(&names)
}
