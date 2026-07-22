use h3o::{LatLng, Resolution};
use serde::Deserialize;
use worker::*;

const KV_BINDING: &str = "SCRATCHMAP";

/// A location report. OwnTracks location messages use `lat`/`lon`; a plain
/// `{"lat":..,"lon":..}` body works too. Extra fields (`_type`, `tst`, …) are ignored.
#[derive(Deserialize)]
struct LocationPayload {
    lat: f64,
    lon: f64,
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

/// POST /scratchmap — reduce a location to its H3 res-5 cell and record the cell ID.
/// Raw coordinates are never stored; the KV key set naturally deduplicates.
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

    // Only write hexes we haven't seen before. Since most points fall in
    // already-visited hexes (home, commute, …), this keeps KV writes — the
    // scarce quota — near zero once you've covered your usual haunts, spending
    // the far more plentiful read quota instead.
    let key = cell.to_string();
    let kv = env.kv(KV_BINDING)?;
    if kv.get(&key).text().await?.is_none() {
        kv.put(&key, "1")?.execute().await?;
    }

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
