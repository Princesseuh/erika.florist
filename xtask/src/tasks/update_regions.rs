use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread::sleep;
use std::time::Duration;

use anyhow::{Context, Result};
use geo::{Centroid, Contains, Coord, LineString, MultiPolygon, Polygon, Simplify};
use h3o::geom::TilerBuilder;
use h3o::{CellIndex, LatLng, Resolution};
use rayon::prelude::*;
use serde::Serialize;
use serde_json::Value;

use crate::utils::{log_info, log_progress, log_success, log_warn, workspace_root};

const CELLS_PATH: &str = "crates/website/content/scratchmap/cells.json";
const REGIONS_PATH: &str = "crates/website/content/scratchmap/regions.json";
// Processed outlines by OSM relation id. A run only downloads relations not in here.
const BOUNDARIES_PATH: &str = "crates/website/content/scratchmap/boundaries-cache.json";
// Boundary ids per visited res-4 area, and tags plus edit timestamps per boundary.
// Holds only facts about OSM, so an idle week writes an identical file.
const SWEEP_PATH: &str = "crates/website/content/scratchmap/sweep-cache.json";
// Metadata and full-detail outlines for every country in the world. Countries are
// the one layer not sourced from OSM: OSM country relations trace maritime legal
// boundaries, far off the coast, while Natural Earth follows the coast with shared
// border arcs. This file is the vendored source; display outlines derive from it on
// every run. Natural Earth is only downloaded to rebuild this file from empty.
const COUNTRY_SHAPES_PATH: &str = "crates/website/content/scratchmap/country-shapes.json";
const NE_PATH: &str = "target/ne_10m_admin_0.json";
const NE_URL: &str =
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";
const USER_AGENT: &str = "erika.florist-scratchmap/1.0 (+https://erika.florist)";
// Public instances shed load with 429/504 responses; requests rotate between them.
// Distinct hosts only: overpass.kumi.systems is a CNAME to overpass.private.coffee,
// so listing both bought no redundancy and failed as one.
const OVERPASS: &[&str] = &[
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
// Instance that answered last, so a run stops leading with a host it knows is sick.
static PREFERRED: AtomicUsize = AtomicUsize::new(0);
// Queries ask the server for up to `[timeout:300]`, and a struggling instance will
// hold the connection that whole time. Give up sooner and ask a different one.
// Tag and timestamp queries return little and a healthy instance answers in seconds;
// geometry batches are megabytes and legitimately take longer.
const METADATA_TIMEOUT: Duration = Duration::from_secs(45);
const GEOMETRY_TIMEOUT: Duration = Duration::from_secs(120);
// Pause between queries to one Overpass instance.
const POLITE: Duration = Duration::from_millis(5000);

// Must match `REVEAL.filled` in scratchmap.ts.
const FILLED_RES: Resolution = Resolution::Ten;

// Badge threshold: more cells than a drive-by leaves, or a real share of a small
// region. Countries always draw.
const MIN_EXPLORED_CELLS: usize = 5;
const MIN_PERCENT: f64 = 0.25;

// Simplification tolerance, ~20 m: far below a 50 m hexagon, so counts stay exact.
// Applied per OSM way, before ring assembly. Neighbour regions share border ways,
// so both sides simplify to identical points and drawn borders coincide at any zoom.
const BASE_TOLERANCE: f64 = 0.0002;

/// Admin levels that libpostal marks as "city" in one country. The data is vendored
/// in xtask/data/libpostal-boundaries.json; the README there has the provenance.
/// Used only to break the 7-vs-8 municipality tie; some rows are stale (Ireland).
fn libpostal_city_levels(root: &std::path::Path, iso: &str) -> Vec<u8> {
    let iso = iso.to_lowercase();
    if iso.is_empty() {
        return Vec::new();
    }
    // Read once: this is called per country, inside the classification loop.
    static TABLES: OnceLock<BTreeMap<String, BTreeMap<String, String>>> = OnceLock::new();
    let tables = TABLES.get_or_init(|| {
        fs::read_to_string(root.join("xtask/data/libpostal-boundaries.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    });
    let Some(table) = tables.get(&iso) else {
        return Vec::new();
    };
    table
        .iter()
        .filter(|(_, kind)| *kind == "city")
        .filter_map(|(level, _)| level.parse().ok())
        .collect()
}

/// Natural Earth 1:10m admin-0 features, downloaded once and cached in target/.
fn load_ne(root: &std::path::Path) -> Result<Value> {
    let path = root.join(NE_PATH);
    if !path.exists() {
        log_progress("downloading Natural Earth 1:10m country outlines (one-time)");
        let json: Value = ureq::get(NE_URL)
            .header("User-Agent", USER_AGENT)
            .call()
            .context("Natural Earth download failed")?
            .body_mut()
            .with_config()
            .limit(64 * 1024 * 1024)
            .read_json()
            .context("Natural Earth returned unexpected JSON")?;
        fs::write(&path, serde_json::to_string(&json)?)?;
    }
    Ok(serde_json::from_str(&fs::read_to_string(&path)?)?)
}

/// One sovereign country in Natural Earth. Dependencies share their sovereign's
/// SOV_A3 (Puerto Rico groups under the US); the representative feature is the most
/// populous member. ISO_A2_EH avoids the "-99" plain ISO_A2 has for France and Norway.
struct NeCountry {
    name: String,
    lat: f64,
    lon: f64,
    ne_id: i64,
    sov: String,
}

fn ne_index(ne: &Value) -> BTreeMap<String, NeCountry> {
    let mut best_pop: BTreeMap<String, f64> = BTreeMap::new();
    let mut out: BTreeMap<String, NeCountry> = BTreeMap::new();
    for feature in ne["features"].as_array().into_iter().flatten() {
        let p = &feature["properties"];
        // NAME_LONG holds the short everyday form ("United States").
        let (Some(sov), Some(iso), Some(name)) = (
            p["SOV_A3"].as_str(),
            p["ISO_A2_EH"].as_str(),
            p["NAME_LONG"].as_str().or(p["NAME"].as_str()),
        ) else {
            continue;
        };
        // Disputed entities share the ISO placeholder "-99" and would collide.
        if iso == "-99" {
            continue;
        }
        let pop = p["POP_EST"].as_f64().unwrap_or(0.0);
        if best_pop.get(sov).is_none_or(|prev| pop > *prev) {
            best_pop.insert(sov.to_string(), pop);
            // A new representative can carry a different ISO key; remove the old entry.
            out.retain(|_, c| c.sov != sov);
            out.insert(
                iso.to_string(),
                NeCountry {
                    name: name.to_string(),
                    lat: p["LABEL_Y"].as_f64().unwrap_or(0.0),
                    lon: p["LABEL_X"].as_f64().unwrap_or(0.0),
                    ne_id: p["NE_ID"].as_i64().unwrap_or(0),
                    sov: sov.to_string(),
                },
            );
        }
    }
    out
}

/// One parsed Natural Earth feature: sovereign key, feature id, geometry.
struct NeFeature {
    sov: String,
    ne_id: i64,
    shape: MultiPolygon<f64>,
}

/// Parse every feature once. Callers iterate this instead of re-parsing per country.
fn ne_features(ne: &Value) -> Vec<NeFeature> {
    ne["features"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|feature| {
            Some(NeFeature {
                sov: feature["properties"]["SOV_A3"].as_str()?.to_string(),
                ne_id: feature["properties"]["NE_ID"].as_i64().unwrap_or(0),
                shape: from_geojson(&feature["geometry"])?,
            })
        })
        .collect()
}

/// Decimate a full-detail country outline for display: full detail near visited
/// cells, world detail elsewhere, small far islets dropped.
fn display_outline(full: &MultiPolygon<f64>, near: &[(f64, f64)]) -> Value {
    let kept: Vec<Polygon<f64>> = full
        .iter()
        .filter(|poly| {
            let (mut minx, mut miny, mut maxx, mut maxy) =
                (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
            for c in poly.exterior().coords() {
                minx = minx.min(c.x);
                miny = miny.min(c.y);
                maxx = maxx.max(c.x);
                maxy = maxy.max(c.y);
            }
            // Keep a ring smaller than ~5 km only if it is near visited cells.
            if (maxx - minx).hypot(maxy - miny) >= 0.05 {
                return true;
            }
            let (cx, cy) = ((minx + maxx) / 2.0, (miny + maxy) / 2.0);
            near.iter()
                .any(|(lat, lng)| (lng - cx).abs() < 3.0 && (lat - cy).abs() < 3.0)
        })
        .map(|poly| {
            Polygon::new(
                LineString::from(adaptive_detail(poly.exterior().0.as_slice(), near)),
                poly.interiors()
                    .iter()
                    .map(|r| LineString::from(adaptive_detail(r.0.as_slice(), near)))
                    .collect(),
            )
        })
        .collect();
    to_geojson(&MultiPolygon(kept))
}

/// A country seed built from Natural Earth: full geometry, badge point, totals.
fn ne_seed(features: &[NeFeature], country: &NeCountry) -> Option<Value> {
    let merged: Vec<Polygon<f64>> = features
        .iter()
        .filter(|f| f.sov == country.sov)
        .flat_map(|f| f.shape.iter().cloned())
        .collect();
    if merged.is_empty() {
        return None;
    }
    let geometry = to_geojson(&MultiPolygon(merged));
    // Totals come from the representative feature only: Denmark's percentage must not
    // divide by Greenland. Area is measured by res-5 tiling because Natural Earth
    // rings wind clockwise, which breaks geodesic area.
    let area = features
        .iter()
        .find(|f| f.ne_id == country.ne_id)
        .map(|f| {
            cells_of(&f.shape, Resolution::Five)
                .iter()
                .map(|c| c.area_m2())
                .sum::<f64>()
        })?;
    let centre = LatLng::new(country.lat, country.lon).ok()?;
    let cell11 = centre.to_cell(Resolution::Eleven).area_m2();
    let cell10 = centre.to_cell(FILLED_RES).area_m2();
    Some(serde_json::json!({
        "name": country.name,
        "osm_id": country.ne_id,
        "lat": country.lat,
        "lon": country.lon,
        "total": (area / cell11).round() as u64,
        "filled_total": (area / cell10).round() as u64,
        "geometry": geometry,
    }))
}

/// Keep full detail near visited cells; simplify the rest to world-view detail.
/// Both sides of a shared border split runs at the same points, and Douglas-Peucker
/// is symmetric under reversal, so shared arcs stay identical.
fn adaptive_detail(coords: &[Coord<f64>], near: &[(f64, f64)]) -> Vec<Coord<f64>> {
    const FAR_TOLERANCE: f64 = 0.05;
    let is_near = |c: &Coord<f64>| {
        near.iter()
            .any(|(lat, lng)| (c.x - lng).abs() < 3.0 && (c.y - lat).abs() < 3.0)
    };

    let mut out: Vec<Coord<f64>> = Vec::new();
    let mut run: Vec<Coord<f64>> = Vec::new();
    let mut run_near = coords.first().map(&is_near).unwrap_or(false);
    let flush = |run: &mut Vec<Coord<f64>>, run_near: bool, out: &mut Vec<Coord<f64>>| {
        if run.is_empty() {
            return;
        }
        // A run of two has nothing to drop, and Douglas-Peucker asserts on one.
        let piece = if run_near || run.len() < 3 {
            std::mem::take(run)
        } else {
            LineString::from(std::mem::take(run)).simplify(&FAR_TOLERANCE).0
        };
        let skip = usize::from(!out.is_empty()); // runs share their boundary point
        out.extend(piece.into_iter().skip(skip));
    };
    for &c in coords {
        let n = is_near(&c);
        if n != run_near {
            let boundary = run.last().copied();
            flush(&mut run, run_near, &mut out);
            run_near = n;
            // Keep the line continuous across the run boundary.
            if let Some(b) = boundary {
                run.push(b);
            }
        }
        run.push(c);
    }
    flush(&mut run, run_near, &mut out);
    out
}

#[derive(Serialize)]
struct Region {
    osm_id: i64,
    name: String,
    level: String,
    lat: f64,
    lon: f64,
    /// Visited hexagons of this region, out of the hexagons it holds. A hexagon
    /// belongs to the region that contains its centre, so a full region reads 100%.
    explored: usize,
    total: usize,
    /// The same pair at res 10, the resolution the "filled" reveal draws.
    filled: usize,
    filled_total: usize,
    geometry: Value,
}

/// Admin level, name, and bounding box from the tag sweep.
type CandidateInfo = (u8, String, [f64; 4]);

#[derive(Clone)]
struct Candidate {
    id: i64,
    admin_level: u8,
    name: String,
    /// (south, west, north, east)
    bb: [f64; 4],
    display_level: String,
}

/// OSM sometimes joins many sub-area names with " / ". Keep the first two.
fn tidy_name(name: &str) -> String {
    let parts: Vec<&str> = name
        .split('/')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() <= 2 {
        name.trim().to_string()
    } else {
        parts[..2].join(" / ")
    }
}

fn share(have: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        have as f64 / total as f64 * 100.0
    }
}

/// Res-`res` hexagons whose centres lie inside `shape`. A polygon the tiler rejects
/// is skipped, so one bad ring cannot zero out a whole country.
fn cells_of(shape: &MultiPolygon<f64>, res: Resolution) -> Vec<CellIndex> {
    let mut tiler = TilerBuilder::new(res).build();
    for polygon in shape {
        if tiler.add(polygon.clone()).is_err() {
            log_warn("  skipped a polygon the tiler rejected");
        }
    }
    tiler.into_coverage().collect()
}

/// MultiPolygon → GeoJSON, [lng, lat], rounded to ~1 m. Rounding can fuse points and
/// decimation can flatten islets; degenerate rings are removed here because a single
/// one makes the tiler reject the whole shape.
fn to_geojson(mp: &MultiPolygon<f64>) -> Value {
    let round = |v: f64| (v * 100_000.0).round() / 100_000.0;
    let coords: Vec<Vec<Vec<[f64; 2]>>> = mp
        .iter()
        .map(|poly| {
            std::iter::once(poly.exterior())
                .chain(poly.interiors())
                .filter_map(|ring| {
                    let mut out: Vec<[f64; 2]> = Vec::with_capacity(ring.0.len());
                    for c in ring.coords() {
                        let p = [round(c.x), round(c.y)];
                        if out.last() != Some(&p) {
                            out.push(p);
                        }
                    }
                    // A closed ring needs a triangle plus the closing point.
                    (out.len() >= 4).then_some(out)
                })
                .collect()
        })
        .filter(|rings: &Vec<Vec<[f64; 2]>>| !rings.is_empty())
        .collect();
    serde_json::json!({ "type": "MultiPolygon", "coordinates": coords })
}

fn from_geojson(value: &Value) -> Option<MultiPolygon<f64>> {
    let geometry: geojson::Geometry = serde_json::from_value(value.clone()).ok()?;
    match geo::Geometry::try_from(geometry).ok()? {
        geo::Geometry::MultiPolygon(mp) => Some(mp),
        geo::Geometry::Polygon(p) => Some(MultiPolygon(vec![p])),
        _ => None,
    }
}

/// One POST to one Overpass instance, no retry.
fn overpass_once(endpoint: &str, query: &str, timeout: Duration) -> Result<Value> {
    ureq::post(endpoint)
        .config()
        .timeout_global(Some(timeout))
        .build()
        .header("User-Agent", USER_AGENT)
        .send_form([("data", query)])
        .with_context(|| format!("Overpass request to {endpoint} failed"))?
        .body_mut()
        .with_config()
        // Geometry batches run far past the default body-size cap.
        .limit(512 * 1024 * 1024)
        .read_json()
        .context("Overpass returned unexpected JSON")
}

/// One POST to one Overpass instance, with retries for transient 429/504 responses.
/// Used where the caller has already picked the instance; `overpass` is the general
/// entry point.
fn overpass_at(endpoint: &str, query: &str) -> Result<Value> {
    const WAITS: &[u64] = &[15, 45];
    let mut last = None;
    for i in 0..=WAITS.len() {
        match overpass_once(endpoint, query, GEOMETRY_TIMEOUT) {
            Ok(value) => return Ok(value),
            Err(e) => {
                last = Some(e);
                if let Some(wait) = WAITS.get(i) {
                    log_warn(&format!(
                        "  Overpass hiccup ({:#}); retrying in {wait}s",
                        last.as_ref().unwrap()
                    ));
                    sleep(Duration::from_secs(*wait));
                }
            }
        }
    }
    Err(last.unwrap())
}

/// One query. Every instance is tried before any backoff, so a sick one costs a
/// request rather than the whole ladder, and the one that answers is tried first next.
fn overpass(query: &str) -> Result<Value> {
    const WAITS: &[u64] = &[15, 45];
    let mut last = None;
    for i in 0..=WAITS.len() {
        let first = PREFERRED.load(Ordering::Relaxed);
        for n in 0..OVERPASS.len() {
            let pick = (first + n) % OVERPASS.len();
            let started = std::time::Instant::now();
            match overpass_once(OVERPASS[pick], query, METADATA_TIMEOUT) {
                Ok(value) => {
                    PREFERRED.store(pick, Ordering::Relaxed);
                    log_info(&format!(
                        "  {} answered in {:.1}s",
                        OVERPASS[pick],
                        started.elapsed().as_secs_f64()
                    ));
                    return Ok(value);
                }
                Err(e) => {
                    log_info(&format!(
                        "  {} did not answer after {:.1}s ({e:#})",
                        OVERPASS[pick],
                        started.elapsed().as_secs_f64()
                    ));
                    last = Some(e);
                }
            }
        }
        if let Some(wait) = WAITS.get(i) {
            log_warn(&format!(
                "  no Overpass instance answered ({:#}); retrying in {wait}s",
                last.as_ref().unwrap()
            ));
            sleep(Duration::from_secs(*wait));
        }
    }
    Err(last.unwrap())
}

/// Boundary discovery and freshness, with a committed results-only cache.
///
/// Three paths, cheapest possible network for each:
/// - New areas: one full sweep each, once ever.
/// - Known boundaries: a weekly timestamp check by relation id (metadata only, no
///   geometry, no area scans). A changed timestamp refreshes that one boundary; an
///   id missing from the response was deleted upstream and is removed.
/// - Known areas: a slow stateless rotation (hash of area vs week of year) re-sweeps
///   each area about once a year, to discover boundaries that did not exist before.
///
/// The cache holds only facts (ids per area, tags and timestamps per boundary), so
/// a week with no OSM changes writes a byte-identical file and CI commits nothing.
/// Returns the candidates and the ids whose geometry must be fetched again.
fn fetch_candidates(
    areas: &[(String, [f64; 4])],
    cell_points: &[(f64, f64)],
    sweep_path: &std::path::Path,
) -> Result<(BTreeMap<i64, CandidateInfo>, BTreeSet<i64>)> {
    let state: BTreeMap<String, Value> = fs::read_to_string(sweep_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut area_ids: BTreeMap<String, Vec<i64>> = state
        .get("areas")
        .and_then(|v| v.as_object())
        .map(|areas| {
            areas
                .iter()
                .map(|(id, list)| {
                    (
                        id.clone(),
                        list.as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|v| v.as_i64())
                            .collect(),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let mut bounds: BTreeMap<String, Value> = state
        .get("boundaries")
        .and_then(|v| v.as_object())
        .map(|b| b.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();

    // Drop areas that no longer hold cells.
    let current: BTreeSet<&str> = areas.iter().map(|(id, _)| id.as_str()).collect();
    area_ids.retain(|id, _| current.contains(id.as_str()));

    let week = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / (7 * 86400))
        .unwrap_or(0);
    let in_rotation = |id: &str| {
        id.parse::<CellIndex>()
            .map(|c| u64::from(c) % 52 == week % 52)
            .unwrap_or(false)
    };

    let mut to_sweep: Vec<&(String, [f64; 4])> = areas
        .iter()
        .filter(|(id, _)| !area_ids.contains_key(id) || in_rotation(id))
        .collect();
    let new_count = to_sweep
        .iter()
        .filter(|(id, _)| !area_ids.contains_key(id))
        .count();
    let mut refreshed: BTreeSet<i64> = BTreeSet::new();

    if !to_sweep.is_empty() {
        log_progress(&format!(
            "sweeping {new_count} new and {} rotation area(s) for boundaries",
            to_sweep.len() - new_count
        ));
    }
    to_sweep.sort_by(|a, b| a.0.cmp(&b.0));
    // Small chunks: `out bb` makes the server load full geometry, and large multi-box
    // queries draw 504 responses.
    for chunk in to_sweep.chunks(10) {
        let clauses: String = chunk
            .iter()
            .map(|(_, b)| {
                format!(
                    "relation[\"boundary\"=\"administrative\"][\"admin_level\"~\"^(7|8|9|10|11)$\"][!\"end_date\"]({},{},{},{});",
                    b[0], b[1], b[2], b[3]
                )
            })
            .collect();
        // Tags and boxes for the boundaries, then their edit timestamps via convert
        // (a full `out meta` would carry every member list).
        let query = format!(
            "[out:json][timeout:300];({clauses})->.r;.r out tags bb;.r convert rel ::id=id(),ts=timestamp();out;"
        );
        let json = overpass(&query)?;
        let mut ts_of: BTreeMap<i64, String> = BTreeMap::new();
        for el in json["elements"].as_array().into_iter().flatten() {
            if el["type"].as_str() == Some("rel")
                && let (Some(id), Some(ts)) = (el["id"].as_i64(), el["tags"]["ts"].as_str())
            {
                ts_of.insert(id, ts.to_string());
            }
        }
        let mut found: Vec<(i64, u8, String, [f64; 4])> = Vec::new();
        for el in json["elements"].as_array().into_iter().flatten() {
            if el["type"].as_str() != Some("relation") {
                continue;
            }
            let (Some(id), Some(tags), Some(bb)) = (
                el["id"].as_i64(),
                el["tags"].as_object(),
                el["bounds"].as_object(),
            ) else {
                continue;
            };
            let Some(level) = tags
                .get("admin_level")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u8>().ok())
            else {
                continue;
            };
            let Some(name) = tags.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            let bb = [
                bb["minlat"].as_f64().unwrap_or(0.0),
                bb["minlon"].as_f64().unwrap_or(0.0),
                bb["maxlat"].as_f64().unwrap_or(0.0),
                bb["maxlon"].as_f64().unwrap_or(0.0),
            ];
            // Only boundaries that can hold a visited cell matter; the rest would
            // bloat the cache and the weekly timestamp checks twelvefold.
            if !cell_points
                .iter()
                .any(|(lat, lng)| *lat >= bb[0] && *lat <= bb[2] && *lng >= bb[1] && *lng <= bb[3])
            {
                continue;
            }
            found.push((id, level, name.to_string(), bb));
        }
        for (id, level, name, bb) in &found {
            let ts = ts_of.get(id).cloned().unwrap_or_default();
            let entry = serde_json::json!({ "l": level, "n": name, "bb": bb, "ts": ts });
            match bounds.get(&id.to_string()) {
                // A boundary seen for the first time needs no geometry purge; the
                // normal missing-id path fetches it.
                None => {
                    bounds.insert(id.to_string(), entry);
                }
                Some(prev) if *prev != entry => {
                    refreshed.insert(*id);
                    bounds.insert(id.to_string(), entry);
                }
                Some(_) => {}
            }
        }
        // A boundary belongs to every area of this chunk that its box intersects.
        for (area_id, ab) in chunk {
            let mine: Vec<i64> = found
                .iter()
                .filter(|(_, _, _, bb)| {
                    bb[0] <= ab[2] && ab[0] <= bb[2] && bb[1] <= ab[3] && ab[1] <= bb[3]
                })
                .map(|(id, _, _, _)| *id)
                .collect();
            // An instance can answer 200 with an empty result set when it is unhealthy
            // or serving a partial database, and that is indistinguishable from an area
            // genuinely holding no boundaries. Losing every region in an area is far
            // worse than keeping a stale list, so only ever grow from empty.
            if mine.is_empty()
                && area_ids.get(area_id).is_some_and(|prev| !prev.is_empty())
            {
                log_warn(&format!(
                    "  area {area_id} swept empty but {} boundary(ies) were known; keeping them",
                    area_ids[area_id].len()
                ));
                continue;
            }
            area_ids.insert(area_id.clone(), mine);
        }
        write_sweep(sweep_path, &area_ids, &bounds)?;
        sleep(POLITE);
    }

    // Timestamp check for every known boundary that this run did not just sweep.
    let known: BTreeSet<i64> = area_ids.values().flatten().copied().collect();
    let to_check: Vec<i64> = known
        .iter()
        .copied()
        .filter(|id| !refreshed.contains(id))
        .collect();
    let mut changed: BTreeSet<i64> = BTreeSet::new();
    let mut deleted: BTreeSet<i64> = BTreeSet::new();
    for chunk in to_check.chunks(1000) {
        let ids: Vec<String> = chunk.iter().map(|id| id.to_string()).collect();
        let query = format!(
            "[out:json][timeout:300];relation(id:{});convert rel ::id=id(),ts=timestamp();out;",
            ids.join(",")
        );
        let json = overpass(&query)?;
        let mut seen: BTreeMap<i64, String> = BTreeMap::new();
        for el in json["elements"].as_array().into_iter().flatten() {
            if let (Some(id), Some(ts)) = (el["id"].as_i64(), el["tags"]["ts"].as_str()) {
                seen.insert(id, ts.to_string());
            }
        }
        // Instances replicate at different speeds, so the same relation can come back
        // with an older timestamp than the one another instance gave us last week.
        // Only a newer one means a real edit; equal or older means this instance is
        // behind, and treating that as a change refetches the whole cache for nothing.
        for id in chunk {
            if let Some(ts) = seen.get(id)
                && bounds
                    .get(&id.to_string())
                    .and_then(|b| b["ts"].as_str())
                    .is_none_or(|stored| ts.as_str() > stored)
            {
                changed.insert(*id);
            }
        }
        // A truncated or partial response is indistinguishable from a mass deletion,
        // and deletion purges the boundary from every area that holds it. Real
        // deletions trickle in ones and twos, so distrust anything larger.
        let absent: Vec<i64> = chunk
            .iter()
            .copied()
            .filter(|id| !seen.contains_key(id))
            .collect();
        let tolerance = (chunk.len() / 20).max(5);
        if absent.len() > tolerance {
            log_warn(&format!(
                "  {} of {} boundaries missing from the timestamp check; \
                 treating the response as partial rather than as deletions",
                absent.len(),
                chunk.len()
            ));
        } else {
            deleted.extend(absent);
        }
        sleep(POLITE);
    }

    // Changed boundaries: refresh tags, box, and timestamp in one query.
    if !changed.is_empty() {
        log_progress(&format!("{} boundary change(s) upstream", changed.len()));
        let ids: Vec<String> = changed.iter().map(|id| id.to_string()).collect();
        let query = format!(
            "[out:json][timeout:300];relation(id:{})->.r;.r out tags bb;.r convert rel ::id=id(),ts=timestamp();out;",
            ids.join(",")
        );
        let json = overpass(&query)?;
        let mut ts_of: BTreeMap<i64, String> = BTreeMap::new();
        for el in json["elements"].as_array().into_iter().flatten() {
            if el["type"].as_str() == Some("rel")
                && let (Some(id), Some(ts)) = (el["id"].as_i64(), el["tags"]["ts"].as_str())
            {
                ts_of.insert(id, ts.to_string());
            }
        }
        for el in json["elements"].as_array().into_iter().flatten() {
            if el["type"].as_str() != Some("relation") {
                continue;
            }
            let (Some(id), Some(tags), Some(bb)) = (
                el["id"].as_i64(),
                el["tags"].as_object(),
                el["bounds"].as_object(),
            ) else {
                continue;
            };
            let level = tags
                .get("admin_level")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u8>().ok());
            let name = tags.get("name").and_then(|v| v.as_str());
            let (Some(level), Some(name)) = (level, name) else {
                deleted.insert(id); // No longer a usable boundary.
                continue;
            };
            let bb = [
                bb["minlat"].as_f64().unwrap_or(0.0),
                bb["minlon"].as_f64().unwrap_or(0.0),
                bb["maxlat"].as_f64().unwrap_or(0.0),
                bb["maxlon"].as_f64().unwrap_or(0.0),
            ];
            let ts = ts_of.get(&id).cloned().unwrap_or_default();
            bounds.insert(
                id.to_string(),
                serde_json::json!({ "l": level, "n": name, "bb": bb, "ts": ts }),
            );
            refreshed.insert(id);
        }
        sleep(POLITE);
    }

    if !deleted.is_empty() {
        log_progress(&format!("{} boundary(ies) deleted upstream", deleted.len()));
        for id in &deleted {
            bounds.remove(&id.to_string());
        }
        for list in area_ids.values_mut() {
            list.retain(|id| !deleted.contains(id));
        }
    }
    bounds.retain(|id, _| {
        id.parse::<i64>()
            .map(|id| known.contains(&id) && !deleted.contains(&id))
            .unwrap_or(false)
    });
    write_sweep(sweep_path, &area_ids, &bounds)?;

    let mut out = BTreeMap::new();
    for (id, info) in &bounds {
        let (Ok(id), Some(level), Some(name), Some(bb)) = (
            id.parse::<i64>(),
            info["l"].as_u64(),
            info["n"].as_str(),
            info["bb"].as_array(),
        ) else {
            continue;
        };
        let bb: Vec<f64> = bb.iter().filter_map(|v| v.as_f64()).collect();
        if bb.len() != 4 {
            continue;
        }
        out.insert(
            id,
            (level as u8, name.to_string(), [bb[0], bb[1], bb[2], bb[3]]),
        );
    }
    refreshed.extend(&deleted);
    Ok((out, refreshed))
}

fn write_sweep(
    path: &std::path::Path,
    areas: &BTreeMap<String, Vec<i64>>,
    bounds: &BTreeMap<String, Value>,
) -> Result<()> {
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string(&serde_json::json!({ "areas": areas, "boundaries": bounds }))?
        ),
    )?;
    Ok(())
}

/// Remove vertices where the line reverses on itself (more than ~168°).
/// Simplification collapses narrow spurs (jetties, lagoon parcels) into zero-width
/// needles, which render as crossing spikes.
fn prune_spikes(line: &mut Vec<Coord<f64>>) {
    loop {
        let mut removed = false;
        let mut i = 1;
        while i + 1 < line.len() {
            let (a, b, c) = (line[i - 1], line[i], line[i + 1]);
            let (v1x, v1y) = (b.x - a.x, b.y - a.y);
            let (v2x, v2y) = (c.x - b.x, c.y - b.y);
            let dot = v1x * v2x + v1y * v2y;
            let m = (v1x * v1x + v1y * v1y).sqrt() * (v2x * v2x + v2y * v2y).sqrt();
            if m > 0.0 && dot / m < -0.98 {
                line.remove(i);
                removed = true;
            } else {
                i += 1;
            }
        }
        if !removed {
            break;
        }
    }
}

/// Join ways into closed rings by matching endpoints. OSM stores boundaries as
/// shared way segments.
fn join_ways(mut ways: Vec<Vec<Coord<f64>>>) -> Vec<LineString<f64>> {
    let key = |c: &Coord<f64>| ((c.x * 1e7).round() as i64, (c.y * 1e7).round() as i64);
    let mut rings = Vec::new();
    while let Some(mut current) = ways.pop() {
        loop {
            if current.len() > 3 && key(&current[0]) == key(current.last().unwrap()) {
                rings.push(LineString::from(current));
                break;
            }
            let tail = key(current.last().unwrap());
            let Some(pos) = ways
                .iter()
                .position(|w| key(&w[0]) == tail || key(w.last().unwrap()) == tail)
            else {
                break; // Unclosed ring: broken data. Dropped.
            };
            let mut next = ways.remove(pos);
            if key(next.last().unwrap()) == tail {
                next.reverse();
            }
            current.extend(next.into_iter().skip(1));
        }
    }
    for ring in &mut rings {
        let mut coords = std::mem::take(&mut ring.0);
        prune_spikes(&mut coords);
        ring.0 = coords;
    }
    rings.retain(|r| r.0.len() > 3);
    rings
}

/// One Overpass relation element with `out geom` members → a MultiPolygon.
fn assemble(element: &Value) -> Option<MultiPolygon<f64>> {
    let mut outer_ways = Vec::new();
    let mut inner_ways = Vec::new();
    for member in element["members"].as_array().into_iter().flatten() {
        if member["type"].as_str() != Some("way") {
            continue;
        }
        let Some(geometry) = member["geometry"].as_array() else {
            continue;
        };
        let coords: Vec<Coord<f64>> = geometry
            .iter()
            .filter_map(|p| {
                Some(Coord {
                    x: p["lon"].as_f64()?,
                    y: p["lat"].as_f64()?,
                })
            })
            .collect();
        if coords.len() < 2 {
            continue;
        }
        // Simplify per way. Endpoints survive, so ring joining still works.
        let coords = LineString::from(coords).simplify(&BASE_TOLERANCE).0;
        match member["role"].as_str() {
            Some("inner") => inner_ways.push(coords),
            _ => outer_ways.push(coords),
        }
    }

    let outer_rings = join_ways(outer_ways);
    if outer_rings.is_empty() {
        return None;
    }
    let inner_rings = join_ways(inner_ways);

    let shells: Vec<Polygon<f64>> = outer_rings
        .iter()
        .map(|r| Polygon::new(r.clone(), vec![]))
        .collect();
    let mut holes: Vec<Vec<LineString<f64>>> = vec![Vec::new(); shells.len()];
    for inner in inner_rings {
        let probe = geo::Point::from(inner.0[0]);
        if let Some(i) = shells.iter().position(|s| s.contains(&probe)) {
            holes[i].push(inner);
        }
    }
    Some(MultiPolygon(
        outer_rings
            .into_iter()
            .zip(holes)
            .map(|(shell, holes)| Polygon::new(shell, holes))
            .collect(),
    ))
}

/// Outlines for the given relation ids, from cache or Overpass. Raw responses cache
/// in target/, so a processing change recomputes locally with no refetch. Processed
/// outlines go to the committed cache that CI reuses. Both are written after every
/// chunk, so an interrupted run resumes.
fn fetch_geometries(
    ids: &[i64],
    stale: &BTreeSet<i64>,
    cache: &mut BTreeMap<String, Value>,
    cache_path: &std::path::Path,
    raw_path: &std::path::Path,
) -> Result<BTreeMap<i64, MultiPolygon<f64>>> {
    let mut raw_cache: BTreeMap<String, Value> = fs::read_to_string(raw_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    // Boundaries edited upstream must fetch fresh geometry.
    for id in stale {
        cache.remove(&id.to_string());
        raw_cache.remove(&id.to_string());
    }

    // A cache entry counts only if it parses as a polygon.
    let usable = |cache: &BTreeMap<String, Value>, key: &str| {
        cache.get(key).and_then(from_geojson).is_some()
    };

    let mut reprocessed = 0usize;
    for id in ids {
        let key = id.to_string();
        if usable(cache, &key) {
            continue;
        }
        let Some(el) = raw_cache.get(&key) else {
            continue;
        };
        match assemble(el) {
            Some(mp) => {
                cache.insert(key, to_geojson(&mp));
                reprocessed += 1;
            }
            None => log_warn(&format!("  could not assemble outline for relation {id}")),
        }
    }
    if reprocessed > 0 {
        log_progress(&format!(
            "reprocessed {reprocessed} outline(s) from the raw cache (no refetch needed)"
        ));
        fs::write(cache_path, format!("{}\n", serde_json::to_string(cache)?))?;
    }

    let missing: Vec<i64> = ids
        .iter()
        .copied()
        .filter(|id| !usable(cache, &id.to_string()) && !raw_cache.contains_key(&id.to_string()))
        .collect();

    // One worker per instance drains a shared queue, so each instance still receives
    // one polite query at a time. A failed chunk goes back in the queue for another
    // instance; after three passes the run aborts, and the caches keep what succeeded.
    let total = missing.len().div_ceil(20);
    if total > 0 {
        log_progress(&format!(
            "fetching {} new region(s) in {total} chunk(s) across {} Overpass instance(s)",
            missing.len(),
            OVERPASS.len()
        ));
        let queue: std::sync::Mutex<std::collections::VecDeque<(Vec<i64>, usize)>> =
            std::sync::Mutex::new(missing.chunks(20).map(|c| (c.to_vec(), 0usize)).collect());
        let state = std::sync::Mutex::new((std::mem::take(cache), std::mem::take(&mut raw_cache), 0usize));
        let fatal: std::sync::Mutex<Option<anyhow::Error>> = std::sync::Mutex::new(None);

        std::thread::scope(|scope| {
            for endpoint in OVERPASS {
                let (queue, state, fatal) = (&queue, &state, &fatal);
                scope.spawn(move || {
                    loop {
                        if fatal.lock().unwrap().is_some() {
                            break;
                        }
                        let Some((chunk, passes)) = queue.lock().unwrap().pop_front() else {
                            break;
                        };
                        let id_list: Vec<String> = chunk.iter().map(|id| id.to_string()).collect();
                        let query = format!(
                            "[out:json][timeout:300];relation(id:{});out geom;",
                            id_list.join(",")
                        );
                        match overpass_at(endpoint, &query) {
                            Ok(json) => {
                                let mut guard = state.lock().unwrap();
                                let (cache, raw_cache, done) = &mut *guard;
                                for el in json["elements"].as_array().into_iter().flatten() {
                                    let Some(id) = el["id"].as_i64() else { continue };
                                    raw_cache.insert(id.to_string(), el.clone());
                                    match assemble(el) {
                                        Some(mp) => {
                                            cache.insert(id.to_string(), to_geojson(&mp));
                                        }
                                        None => log_warn(&format!(
                                            "  could not assemble outline for relation {id}"
                                        )),
                                    }
                                }
                                *done += 1;
                                log_progress(&format!("fetching boundaries {done}/{total}"));
                                let _ = fs::write(raw_path, serde_json::to_string(raw_cache).unwrap_or_default());
                                let _ = fs::write(
                                    cache_path,
                                    format!("{}\n", serde_json::to_string(cache).unwrap_or_default()),
                                );
                            }
                            Err(e) => {
                                if passes + 1 >= 3 {
                                    *fatal.lock().unwrap() = Some(e);
                                    break;
                                }
                                queue.lock().unwrap().push_back((chunk, passes + 1));
                            }
                        }
                        sleep(POLITE);
                    }
                });
            }
        });

        // The raw cache was already persisted chunk-by-chunk inside the workers.
        let (cache_back, _raw_back, _) = state.into_inner().unwrap();
        *cache = cache_back;
        if let Some(e) = fatal.into_inner().unwrap() {
            return Err(e.context("a boundary chunk failed on every Overpass instance"));
        }
    }

    let mut shapes = BTreeMap::new();
    for id in ids {
        if let Some(mp) = cache.get(&id.to_string()).and_then(from_geojson) {
            shapes.insert(*id, mp);
        }
    }
    Ok(shapes)
}

pub fn run_update_regions() -> Result<()> {
    let root = workspace_root();
    let regions_path = root.join(REGIONS_PATH);
    let boundaries_path = root.join(BOUNDARIES_PATH);

    let cells: Vec<CellIndex> = fs::read_to_string(root.join(CELLS_PATH))
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
        .iter()
        .filter_map(|id| id.parse().ok())
        .collect();

    if cells.is_empty() {
        fs::write(&regions_path, "[]\n")?;
        log_success("No cells yet — wrote empty regions.json.");
        return Ok(());
    }

    let visited: BTreeSet<CellIndex> = cells.iter().copied().collect();
    let revealed: BTreeSet<CellIndex> = cells.iter().filter_map(|c| c.parent(FILLED_RES)).collect();
    let cell_points: Vec<(f64, f64)> = cells
        .iter()
        .map(|c| {
            let ll = LatLng::from(*c);
            (ll.lat(), ll.lng())
        })
        .collect();

    // Country shapes classify every other region and attribute cells to countries.
    // The file is machine-written; a missing file rebuilds through auto-seeding below.
    let shapes_path = root.join(COUNTRY_SHAPES_PATH);
    let mut country_shapes: BTreeMap<String, Value> = fs::read_to_string(&shapes_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut boundaries: BTreeMap<String, Value> = fs::read_to_string(&boundaries_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let raw_geom_path = root.join("target/overpass-raw-relations.json");
    // Bootstrap only: an empty file rebuilds every country from Natural Earth.
    // Weekly runs never load Natural Earth.
    if country_shapes.is_empty() {
        match load_ne(&root) {
            Ok(ne) => {
                let feats = ne_features(&ne);
                for (iso, country) in &ne_index(&ne) {
                    if let Some(seed) = ne_seed(&feats, country) {
                        country_shapes.insert(iso.clone(), seed);
                    }
                }
                log_progress(&format!(
                    "seeded {} countries from Natural Earth",
                    country_shapes.len()
                ));
                fs::write(
                    &shapes_path,
                    format!("{}\n", serde_json::to_string(&country_shapes)?),
                )?;
            }
            Err(e) => log_warn(&format!("Natural Earth unavailable ({e:#})")),
        }
    }
    // ISO, metadata, geometry, and a padded bounding box that gates the point tests
    // below (a world of countries is too many for ungated polygon math).
    type Country = (String, Value, MultiPolygon<f64>, [f64; 4]);
    let build_countries = |shapes: &BTreeMap<String, Value>| -> Vec<Country> {
        shapes
            .iter()
            .filter_map(|(iso, meta)| {
                let mp = from_geojson(&meta["geometry"])?;
                let (mut s, mut w, mut nn, mut e) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
                for poly in &mp {
                    for c in poly.exterior().coords() {
                        s = s.min(c.y);
                        w = w.min(c.x);
                        nn = nn.max(c.y);
                        e = e.max(c.x);
                    }
                }
                Some((iso.clone(), meta.clone(), mp, [s - 1.6, w - 1.6, nn + 1.6, e + 1.6]))
            })
            .collect()
    };
    let countries = build_countries(&country_shapes);

    // 1. One bounding box for each visited res-4 area (~35 km across).
    let mut areas = Vec::new();
    for parent in cells
        .iter()
        .filter_map(|c| c.parent(Resolution::Four))
        .collect::<BTreeSet<_>>()
    {
        let (mut s, mut w, mut n, mut e) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
        for vertex in parent.boundary().iter() {
            s = s.min(vertex.lat());
            w = w.min(vertex.lng());
            n = n.max(vertex.lat());
            e = e.max(vertex.lng());
        }
        areas.push((parent.to_string(), [s - 0.02, w - 0.02, n + 0.02, e + 0.02]));
    }
    let (raw, stale) = fetch_candidates(&areas, &cell_points, &root.join(SWEEP_PATH))?;

    // 2. Classify each boundary by country and keep only ones that can hold a visited
    // cell. Pass one learns which admin levels exist per country; pass two assigns
    // display levels.
    let classify = |bb: &[f64; 4]| -> &str {
        let centre = geo::Point::new((bb[1] + bb[3]) / 2.0, (bb[0] + bb[2]) / 2.0);
        // Containment first. Coastal bounding-box centres fall in the sea, so fall
        // back to the nearest country.
        let near: Vec<&Country> = countries
            .iter()
            .filter(|(_, _, _, b)| {
                centre.y() >= b[0] && centre.y() <= b[2] && centre.x() >= b[1] && centre.x() <= b[3]
            })
            .collect();
        near.iter()
            .find(|(_, _, mp, _)| mp.contains(&centre))
            .map(|(iso, _, _, _)| iso.as_str())
            .or_else(|| {
                use geo::EuclideanDistance;
                near.iter()
                    .map(|(iso, _, mp, _)| (iso.as_str(), mp.euclidean_distance(&centre)))
                    .filter(|(_, d)| *d < 0.5) // ~50 km: offshore, not another continent
                    .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                    .map(|(iso, _)| iso)
            })
            .unwrap_or("")
    };

    let mut iso_of: BTreeMap<i64, &str> = BTreeMap::new();
    let mut present: BTreeMap<&str, BTreeMap<u8, usize>> = BTreeMap::new();
    for (id, (admin_level, _, bb)) in &raw {
        if !cell_points
            .iter()
            .any(|(lat, lng)| *lat >= bb[0] && *lat <= bb[2] && *lng >= bb[1] && *lng <= bb[3])
        {
            continue;
        }
        let iso = classify(bb);
        iso_of.insert(*id, iso);
        *present
            .entry(iso)
            .or_default()
            .entry(*admin_level)
            .or_default() += 1;
    }

    // Which admin_level is the municipality? libpostal answers when it names 7 or 8
    // and such boundaries exist. Otherwise the more numerous of 7/8 wins, because
    // municipalities are the small, numerous tier (180 communes, 2 arrondissements).
    // The count rule also guards against stale libpostal rows. Districts are 9-11.
    let mut city_level_memo: BTreeMap<String, u8> = BTreeMap::new();
    for (iso, counts) in &present {
        let n = |level: u8| counts.get(&level).copied().unwrap_or(0);
        let candidates_78: Vec<u8> = libpostal_city_levels(&root, iso)
            .into_iter()
            .filter(|l| (*l == 7 || *l == 8) && n(*l) > 0)
            .collect();
        let city = candidates_78
            .into_iter()
            .max_by_key(|l| n(*l))
            .unwrap_or_else(|| if n(7) > n(8) { 7 } else { 8 });
        city_level_memo.insert(iso.to_string(), city);
    }

    let mut candidates: Vec<Candidate> = Vec::new();
    let mut by_level: BTreeMap<(String, u8), usize> = BTreeMap::new();
    for (id, (admin_level, name, bb)) in &raw {
        let Some(iso) = iso_of.get(id) else { continue };
        let city_level = city_level_memo.get(*iso).copied().unwrap_or(8);
        let display_level = if *admin_level == city_level {
            "city"
        } else if (9..=11).contains(admin_level) {
            "district"
        } else {
            continue;
        };
        *by_level
            .entry((iso.to_string(), *admin_level))
            .or_default() += 1;
        candidates.push(Candidate {
            id: *id,
            admin_level: *admin_level,
            name: name.clone(),
            bb: *bb,
            display_level: display_level.to_string(),
        });
    }
    log_progress(&format!(
        "{} boundary candidate(s): {}",
        candidates.len(),
        by_level
            .iter()
            .map(|((iso, lvl), n)| format!("{iso}/{lvl}×{n}"))
            .collect::<Vec<_>>()
            .join(", ")
    ));

    // 3. Outlines.
    let ids: Vec<i64> = candidates.iter().map(|c| c.id).collect();
    let shapes = fetch_geometries(&ids, &stale, &mut boundaries, &boundaries_path, &raw_geom_path)?;

    // 4. Count. The outline is tiled at both reveal resolutions and intersected with
    // the visited set, so numerator and denominator come from the same hexagons.
    struct Counted {
        candidate: Candidate,
        shape: MultiPolygon<f64>,
        explored: usize,
        total: usize,
        filled: usize,
        filled_total: usize,
    }
    log_progress(&format!("counting hexagons in {} region(s)", ids.len()));
    // Regions stay exactly as OSM maps them, water included. OSM maritime extents
    // disagree between admin levels, so a clip to the country cuts real land
    // (Styrsö sits outside Sweden's own polygon).
    // Tiling a region is most of this task's work and each one stands alone.
    let done = std::sync::atomic::AtomicUsize::new(0);
    let step = (ids.len() / 8).max(1);
    let mut counted: Vec<Counted> = candidates
        .into_par_iter()
        .filter_map(|candidate| {
            let shape = shapes.get(&candidate.id)?;
            let precise = cells_of(shape, Resolution::Eleven);
            let explored = precise.iter().filter(|c| visited.contains(c)).count();
            // The bounding box touched cells; the region did not.
            let counted = (explored > 0).then(|| {
                let coarse = cells_of(shape, FILLED_RES);
                Counted {
                    explored,
                    total: precise.len(),
                    filled: coarse.iter().filter(|c| revealed.contains(c)).count(),
                    filled_total: coarse.len(),
                    shape: shape.clone(),
                    candidate,
                }
            });
            // Counted after the tiling, so a stall shows as a number that stops moving.
            let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if n.is_multiple_of(step) {
                log_progress(&format!("  counted {n}/{}", ids.len()));
            }
            counted
        })
        .collect();

    // 5. De-overlap per display level, finest admin_level first: drop a region that
    // contains an already-kept finer one. This keeps a commune from sitting at the
    // district level on top of its own quartiers.
    log_progress(&format!("de-overlapping {} counted region(s)", counted.len()));
    counted.sort_by(|a, b| {
        b.candidate
            .admin_level
            .cmp(&a.candidate.admin_level)
            .then_with(|| a.candidate.id.cmp(&b.candidate.id))
    });
    let mut kept: Vec<Counted> = Vec::new();
    for region in counted {
        let contains_finer = kept.iter().any(|k| {
            k.candidate.display_level == region.candidate.display_level
                && k.candidate.admin_level > region.candidate.admin_level
                && k.shape
                    .centroid()
                    .is_some_and(|c| region.shape.contains(&c))
        });
        if contains_finer {
            continue;
        }
        kept.push(region);
    }

    // 6. Badge threshold, before the gap-fill so the gap-fill sees what will be drawn.
    kept.retain(|r| {
        r.explored > MIN_EXPLORED_CELLS || share(r.explored, r.total) >= MIN_PERCENT
    });

    // 7. Gap-fill: a city with no surviving district inside it also stands in for
    // itself at the district zoom. Cities with real districts are not duplicated.
    log_progress(&format!("gap-filling from {} kept region(s)", kept.len()));
    let clones: Vec<Counted> = kept
        .iter()
        .filter(|c| c.candidate.display_level == "city")
        .filter(|city| {
            !kept.iter().any(|d| {
                d.candidate.display_level == "district"
                    && d.shape
                        .centroid()
                        .is_some_and(|centre| city.shape.contains(&centre))
            })
        })
        .map(|city| {
            let mut candidate = city.candidate.clone();
            candidate.display_level = "district".to_string();
            Counted {
                candidate,
                shape: city.shape.clone(),
                explored: city.explored,
                total: city.total,
                filled: city.filled,
                filled_total: city.filled_total,
            }
        })
        .collect();
    kept.extend(clones);

    // 8. Countries. Attribute res-6 parents (~6 km) of visited cells: nearest country
    // within 1.5 degrees (containment gives distance zero). Res 3 cells (~110 km)
    // lost coastal cities to the sea and border cells to the neighbour country.
    log_progress(&format!("attributing cells to {} countries", countries.len()));
    let mut country_of: BTreeMap<CellIndex, usize> = BTreeMap::new();
    {
        use geo::EuclideanDistance;
        let parents6: BTreeSet<CellIndex> = cells
            .iter()
            .chain(revealed.iter())
            .filter_map(|c| c.parent(Resolution::Six))
            .collect();
        for parent in parents6 {
            let ll = LatLng::from(parent);
            let point = geo::Point::new(ll.lng(), ll.lat());
            let owner = countries
                .iter()
                .enumerate()
                .filter(|(_, (_, _, _, b))| {
                    ll.lat() >= b[0] && ll.lat() <= b[2] && ll.lng() >= b[1] && ll.lng() <= b[3]
                })
                .map(|(i, (_, _, shape, _))| (i, shape.euclidean_distance(&point)))
                .filter(|(_, d)| *d < 1.5)
                .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
            if let Some((i, _)) = owner {
                country_of.insert(parent, i);
            }
        }
    }
    let mut country_regions: Vec<Region> = Vec::new();
    for (i, (_, prior_entry, shape, _)) in countries.iter().enumerate() {
        let osm_id = prior_entry["osm_id"].as_i64().unwrap_or_default();
        let explored = cells
            .iter()
            .filter(|c| {
                c.parent(Resolution::Six)
                    .is_some_and(|p| country_of.get(&p) == Some(&i))
            })
            .count();
        let filled = revealed
            .iter()
            .filter(|c| {
                c.parent(Resolution::Six)
                    .is_some_and(|p| country_of.get(&p) == Some(&i))
            })
            .count();
        country_regions.push(Region {
            osm_id,
            name: prior_entry["name"].as_str().unwrap_or_default().to_string(),
            level: "country".to_string(),
            lat: prior_entry["lat"].as_f64().unwrap_or_default(),
            lon: prior_entry["lon"].as_f64().unwrap_or_default(),
            explored,
            total: prior_entry["total"].as_u64().unwrap_or_default() as usize,
            filled,
            filled_total: prior_entry["filled_total"].as_u64().unwrap_or_default() as usize,
            geometry: display_outline(shape, &cell_points),
        });
    }

    // 10. Output. The displayed outline is the counting outline: a second per-region
    // simplification would desynchronise shared borders again.
    log_progress("building output geometry");
    let mut regions: Vec<Region> = kept
        .into_iter()
        .map(|region| {
            let centre = region.shape.centroid();
            let display = region.shape.clone();
            Region {
                osm_id: region.candidate.id,
                name: tidy_name(&region.candidate.name),
                level: region.candidate.display_level.clone(),
                lat: centre.map(|c| c.y()).unwrap_or(region.candidate.bb[0]),
                lon: centre.map(|c| c.x()).unwrap_or(region.candidate.bb[1]),
                explored: region.explored,
                total: region.total,
                filled: region.filled,
                filled_total: region.filled_total,
                geometry: to_geojson(&display),
            }
        })
        .collect();
    regions.extend(country_regions);
    regions.sort_by(|a, b| {
        a.level.cmp(&b.level).then(
            share(b.explored, b.total)
                .partial_cmp(&share(a.explored, a.total))
                .unwrap(),
        )
    });

    fs::write(
        &regions_path,
        format!("{}\n", serde_json::to_string(&regions)?),
    )?;
    log_success(&format!("Wrote {} region(s) to regions.json.", regions.len()));
    Ok(())
}
