use std::collections::BTreeMap;
use std::fs;
use std::thread::sleep;
use std::time::Duration;

use anyhow::{Context, Result};
use geo::{GeodesicArea, MultiPolygon};
use h3o::{CellIndex, LatLng, Resolution};
use serde::{Deserialize, Serialize};

use crate::utils::{log_info, log_success, log_warn, workspace_root};

const CELLS_PATH: &str = "crates/website/content/scratchmap/cells.json";
const REGIONS_PATH: &str = "crates/website/content/scratchmap/regions.json";
// Persisted geocode results, so weekly runs only hit Nominatim for *new* areas.
const CACHE_PATH: &str = "crates/website/content/scratchmap/regions-cache.json";

// Average area of an H3 resolution-11 cell, in m².
const RES11_AREA_M2: f64 = 2149.643;

const USER_AGENT: &str = "erika.florist-scratchmap/1.0 (+https://erika.florist)";
const NOMINATIM: &str = "https://nominatim.openstreetmap.org/reverse";

// Nominatim's public API asks for max 1 request/second.
const RATE_LIMIT: Duration = Duration::from_millis(1100);

// (level name, Nominatim reverse `zoom`, H3 resolution to dedupe sample points at).
// Coarser levels need fewer samples, so we dedupe them harder to save requests.
const LEVELS: &[(&str, u8, Resolution)] = &[
    ("district", 14, Resolution::Seven),
    ("city", 10, Resolution::Five),
    ("country", 3, Resolution::Three),
];

#[derive(Serialize)]
struct Region {
    name: String,
    level: String,
    lat: f64,
    lon: f64,
    percent: f64,
    explored: usize,
}

/// A geocoded region, cached by the sample cell that produced it. A cache value of
/// `null` means "looked up, no usable polygon" — so point-only places (common at the
/// district level) aren't re-queried every week.
#[derive(Serialize, Deserialize, Clone)]
struct CachedRegion {
    osm_id: i64,
    name: String,
    level: String,
    area: f64,
    lat: f64,
    lon: f64,
}

#[derive(Deserialize)]
struct ReverseResponse {
    osm_id: Option<i64>,
    name: Option<String>,
    lat: Option<String>,
    lon: Option<String>,
    #[serde(default)]
    address: serde_json::Map<String, serde_json::Value>,
    geojson: Option<serde_json::Value>,
}

/// Reverse-geocode a point at a given zoom, returning the region (with area) it lands
/// in, or `None` if there's no polygon to measure.
fn reverse(lat: f64, lon: f64, zoom: u8, level: &str) -> Result<Option<CachedRegion>> {
    let url = format!(
        "{NOMINATIM}?format=jsonv2&lat={lat}&lon={lon}&zoom={zoom}&polygon_geojson=1&addressdetails=1&accept-language=en"
    );
    let mut resp: ReverseResponse = ureq::get(&url)
        .header("User-Agent", USER_AGENT)
        .call()
        .context("Nominatim request failed")?
        .body_mut()
        .read_json()
        .context("Nominatim returned unexpected JSON")?;

    let Some(geojson_value) = resp.geojson.take() else {
        return Ok(None);
    };
    let geometry: geojson::Geometry = match serde_json::from_value(geojson_value) {
        Ok(g) => g,
        Err(_) => return Ok(None),
    };
    let poly: MultiPolygon<f64> = match geo::Geometry::try_from(geometry) {
        Ok(geo::Geometry::Polygon(p)) => MultiPolygon(vec![p]),
        Ok(geo::Geometry::MultiPolygon(mp)) => mp,
        _ => return Ok(None),
    };
    let area = poly.geodesic_area_unsigned();
    if area <= 0.0 {
        return Ok(None);
    }

    let name = tidy_name(&region_name(&resp, level));
    if name.is_empty() {
        return Ok(None);
    }

    let plat = resp.lat.and_then(|s| s.parse().ok()).unwrap_or(lat);
    let plon = resp.lon.and_then(|s| s.parse().ok()).unwrap_or(lon);
    let osm_id = resp
        .osm_id
        .unwrap_or_else(|| (plat * 1000.0) as i64 * 1_000_000 + (plon * 1000.0) as i64);

    Ok(Some(CachedRegion {
        osm_id,
        name,
        level: level.to_string(),
        area,
        lat: plat,
        lon: plon,
    }))
}

/// Pick the best display name for a level from Nominatim's address components.
fn region_name(resp: &ReverseResponse, level: &str) -> String {
    let addr = |key: &str| {
        resp.address
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    let keys: &[&str] = match level {
        "district" => &[
            "city_district",
            "district",
            "borough",
            "suburb",
            "quarter",
            "neighbourhood",
        ],
        "city" => &["city", "town", "municipality", "village"],
        _ => &["country"],
    };
    keys.iter()
        .find_map(|k| addr(k))
        .or_else(|| resp.name.clone())
        .unwrap_or_default()
}

/// OSM sometimes names a district by concatenating every sub-area with " / "
/// (e.g. "Minimes / Barrière de Paris / Ponts-Jumeaux / …"). Trim to the first two
/// for a Bump-style label.
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

pub fn run_update_regions() -> Result<()> {
    let root = workspace_root();
    let regions_path = root.join(REGIONS_PATH);
    let cache_path = root.join(CACHE_PATH);

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

    // Cache maps a sample cell id → its region (or null when there's no polygon).
    let mut cache: BTreeMap<String, Option<CachedRegion>> = fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut cache_dirty = false;

    // Tally visited cells per distinct region, keyed by (level, OSM id).
    let mut tally: BTreeMap<(String, i64), (CachedRegion, usize)> = BTreeMap::new();

    for (level, zoom, dedupe_res) in LEVELS {
        // Group cells by coarse parent; keep a count and one real sample cell each.
        let mut groups: BTreeMap<CellIndex, (usize, CellIndex)> = BTreeMap::new();
        for cell in &cells {
            if let Some(parent) = cell.parent(*dedupe_res) {
                let entry = groups.entry(parent).or_insert((0, *cell));
                entry.0 += 1;
            }
        }
        let to_geocode = groups
            .keys()
            .filter(|k| !cache.contains_key(&k.to_string()))
            .count();
        log_info(&format!(
            "{level}: {} area(s), {to_geocode} new to geocode",
            groups.len()
        ));

        for (parent, (count, sample)) in &groups {
            let key = parent.to_string();
            if !cache.contains_key(&key) {
                let ll = LatLng::from(*sample);
                match reverse(ll.lat(), ll.lng(), *zoom, level) {
                    Ok(region) => {
                        cache.insert(key.clone(), region);
                        cache_dirty = true;
                    }
                    // Leave uncached on transient errors so it's retried next run.
                    Err(e) => log_warn(&format!("  reverse geocode failed for {key}: {e}")),
                }
                sleep(RATE_LIMIT);
            }
            if let Some(Some(region)) = cache.get(&key) {
                tally
                    .entry((region.level.clone(), region.osm_id))
                    .or_insert_with(|| (region.clone(), 0))
                    .1 += count;
            }
        }
    }

    let mut regions: Vec<Region> = tally
        .into_values()
        .map(|(region, count)| {
            let percent = (count as f64 * RES11_AREA_M2 / region.area * 100.0).min(100.0);
            Region {
                name: region.name,
                level: region.level,
                lat: region.lat,
                lon: region.lon,
                percent,
                explored: count,
            }
        })
        .collect();
    regions.sort_by(|a, b| {
        a.level
            .cmp(&b.level)
            .then(b.percent.partial_cmp(&a.percent).unwrap())
    });

    fs::write(
        &regions_path,
        format!("{}\n", serde_json::to_string_pretty(&regions)?),
    )?;
    if cache_dirty {
        fs::write(
            &cache_path,
            format!("{}\n", serde_json::to_string_pretty(&cache)?),
        )?;
    }
    log_success(&format!(
        "Wrote {} region(s) to regions.json.",
        regions.len()
    ));
    Ok(())
}
