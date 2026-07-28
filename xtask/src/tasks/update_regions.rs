use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use geo::{Area, GeodesicArea, MultiPolygon, Simplify};
use h3o::{CellIndex, LatLng, Resolution};
use serde::{Deserialize, Serialize};

use crate::utils::{log_progress, log_success, log_warn, workspace_root};

const CELLS_PATH: &str = "crates/website/content/scratchmap/cells.json";
const REGIONS_PATH: &str = "crates/website/content/scratchmap/regions.json";
// Persisted geocode results, so weekly runs only hit Nominatim for *new* areas.
const CACHE_PATH: &str = "crates/website/content/scratchmap/regions-cache.json";

// The resolution the map's "filled" reveal coarsens to — keep in sync with `REVEAL` in
// scratchmap.ts. Filling a res-10 parent paints all seven of its children, so the area it
// clears is real but larger than the area actually walked; both are reported.
const FILLED_RES: Resolution = Resolution::Ten;

// A region has to be more than a drive-by before it earns a badge. One GPS fix inside a
// commune's boundary leaves a single 50 m hex behind, which would otherwise label the map
// with a permanent `0.0037%` — a fifth of all regions are exactly that. The percent escape
// hatch spares genuinely small areas, where two cells really can be several percent of a
// city block. Countries are always drawn: a country you've set foot in is worth saying so.
const MIN_EXPLORED_CELLS: usize = 5;
const MIN_PERCENT: f64 = 0.25;

const USER_AGENT: &str = "erika.florist-scratchmap/1.0 (+https://erika.florist)";
const NOMINATIM: &str = "https://nominatim.openstreetmap.org/reverse";

// Nominatim's public API asks for max 1 request/second.
const RATE_LIMIT: Duration = Duration::from_millis(1100);

// (level name, Nominatim reverse `zoom`, H3 resolution to dedupe sample points at).
// Coarser levels need fewer samples, so we dedupe them harder to save requests.
const LEVELS: &[(&str, u8, Resolution)] = &[
    // Sample districts every ~530 m (res 8) so neighbouring quartiers are picked up
    // separately rather than a coarser sample lumping them together.
    ("district", 14, Resolution::Eight),
    // Sample cities every ~1.4 km (res 7). French communes are small and often adjacent,
    // so a coarser sample lets two neighbours share one cell — the sampled town wins and
    // the other is dropped, its cells miscredited (e.g. Gigean absorbed into Poussan).
    ("city", 10, Resolution::Seven),
    ("country", 3, Resolution::Three),
];

#[derive(Serialize)]
struct Region {
    osm_id: i64,
    name: String,
    level: String,
    lat: f64,
    lon: f64,
    /// The region's own area in m², so the page can derive a percentage for whichever
    /// reveal it's drawing — and keep it exact as live mode adds cells.
    area: f64,
    /// Summed area of the visited res-11 cells: the ground you've actually covered.
    explored_m2: f64,
    /// Summed area of those cells' distinct res-10 parents: what the "filled" reveal
    /// clears. Always ≥ `explored_m2`, since one visited child fills its whole parent.
    filled_m2: f64,
    explored: usize,
    /// Simplified boundary as a GeoJSON MultiPolygon, for drawing the outline. This is
    /// the only place the geometry lives — the cache keeps just the lookup metadata,
    /// and a run reuses the previous regions.json's geometry for cached regions.
    geometry: serde_json::Value,
}

/// A geocoded region's lookup metadata, cached by the sample cell that produced it. A
/// cache value of `null` means "looked up, no usable polygon" — so point-only places
/// (common at the district level) aren't re-queried every week. Deliberately holds no
/// geometry, to keep the cache file tiny.
#[derive(Serialize, Deserialize, Clone)]
struct CachedRegion {
    osm_id: i64,
    name: String,
    level: String,
    area: f64,
    lat: f64,
    lon: f64,
}

/// Douglas-Peucker tolerance (degrees) per level — coarser for bigger regions so a
/// country outline doesn't ship thousands of points.
fn simplify_tolerance(level: &str) -> f64 {
    match level {
        // Districts are small; keep them full-detail (0 = no simplify) so adjacent
        // districts' shared borders stay coincident instead of diverging into slivers.
        "district" => 0.0,
        "city" => 0.002,
        // Countries are viewed from far away and have huge, complex borders — simplify
        // hard so the outline stays roughly a hundred points, not thousands.
        _ => 0.15,
    }
}

/// Keep only the largest polygon — drops far-flung territories/islands that bloat a
/// country outline you're only ever viewing over its mainland.
fn primary_landmass(mp: MultiPolygon<f64>) -> MultiPolygon<f64> {
    match mp
        .into_iter()
        .max_by(|a, b| a.unsigned_area().partial_cmp(&b.unsigned_area()).unwrap())
    {
        Some(biggest) => MultiPolygon(vec![biggest]),
        None => MultiPolygon(vec![]),
    }
}

/// A simplified `geo` MultiPolygon → a compact GeoJSON MultiPolygon value ([lng,lat],
/// coordinates rounded to ~1 m).
fn to_geojson(mp: &MultiPolygon<f64>) -> serde_json::Value {
    let round = |v: f64| (v * 100_000.0).round() / 100_000.0;
    let coords: Vec<Vec<Vec<[f64; 2]>>> = mp
        .iter()
        .map(|poly| {
            std::iter::once(poly.exterior())
                .chain(poly.interiors())
                .map(|ring| ring.coords().map(|c| [round(c.x), round(c.y)]).collect())
                .collect()
        })
        .collect();
    serde_json::json!({ "type": "MultiPolygon", "coordinates": coords })
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

/// Reverse-geocode a point at a given zoom, returning the region's metadata and its
/// (simplified) outline geometry, or `None` if there's no polygon to measure.
fn reverse(
    lat: f64,
    lon: f64,
    zoom: u8,
    level: &str,
) -> Result<Option<(CachedRegion, serde_json::Value)>> {
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

    let tolerance = simplify_tolerance(level);
    let simplified = if tolerance > 0.0 {
        poly.simplify(&tolerance)
    } else {
        poly
    };
    let outline = if level == "country" {
        primary_landmass(simplified)
    } else {
        simplified
    };
    let geometry = to_geojson(&outline);

    let region = CachedRegion {
        osm_id,
        name,
        level: level.to_string(),
        area,
        lat: plat,
        lon: plon,
    };
    Ok(Some((region, geometry)))
}

/// Pick the best display name for a level from Nominatim's address components.
fn region_name(resp: &ReverseResponse, level: &str) -> String {
    let addr = |key: &str| {
        resp.address
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };

    // Districts name themselves. The polygon we keep — and the area `percent` divides by —
    // belongs to the feature Nominatim returned, so only that feature's own name describes
    // the number on the badge. The address block routinely carries a coarser container
    // instead: every suburb inside Gothenburg's `Centrum` stadsområde reports
    // `city_district = "Centrum"`, which would file one suburb's completion under its
    // parent's name. Some features aren't in the address block at all (a Paris quartier
    // comes back as `city_block`, which has no address key), so no ordering of those keys
    // can name them. Cities and countries keep the walk below: there the address component
    // really is the level being named.
    if level == "district"
        && let Some(name) = resp
            .name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
    {
        return name.to_string();
    }

    let keys: &[&str] = match level {
        "district" => &[
            "city_district",
            "district",
            "borough",
            "suburb",
            "quarter",
            "neighbourhood",
        ],
        // `municipality` last: in France it's the intercommunal métropole (e.g. every
        // commune in Montpellier Métropole reports municipality="Montpellier"), which
        // would collapse distinct towns into one. village/town/city name the commune.
        "city" => &["city", "town", "village", "municipality"],
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

/// Share of a region covered by an area, as a percentage. Capped at 100: a cell credited
/// to a region can spill over its boundary, and a filled res-10 parent easily covers more
/// than a small district.
fn share(area_m2: f64, region_area: f64) -> f64 {
    if region_area <= 0.0 {
        0.0
    } else {
        (area_m2 / region_area * 100.0).min(100.0)
    }
}

/// `m:ss` — for compact elapsed / ETA readouts in the progress log.
fn fmt_dur(secs: u64) -> String {
    format!("{}:{:02}", secs / 60, secs % 60)
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

    // Cache maps a sample cell id → its region metadata (or null when there's no polygon).
    let mut cache: BTreeMap<String, Option<CachedRegion>> = fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut cache_dirty = false;

    // Geometry lives only in regions.json. Reuse the previous run's for cached regions
    // (keyed by OSM id) so we don't re-geocode just to redraw an unchanged outline.
    let prior_geometry: BTreeMap<i64, serde_json::Value> = fs::read_to_string(&regions_path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| Some((r.get("osm_id")?.as_i64()?, r.get("geometry")?.clone())))
        .collect();
    let mut fresh_geometry: BTreeMap<i64, serde_json::Value> = BTreeMap::new();

    // What a region has to show for itself: how many cells, how much ground they cover,
    // and how much the coarser "filled" reveal paints for them.
    #[derive(Default, Clone)]
    struct Covered {
        cells: usize,
        explored_m2: f64,
        filled_m2: f64,
    }
    impl Covered {
        fn add(&mut self, other: &Covered) {
            self.cells += other.cells;
            self.explored_m2 += other.explored_m2;
            self.filled_m2 += other.filled_m2;
        }
    }

    // Tally coverage per distinct region, keyed by (level, OSM id).
    let mut tally: BTreeMap<(String, i64), (CachedRegion, Covered)> = BTreeMap::new();

    for (level, zoom, dedupe_res) in LEVELS {
        // Group cells by coarse parent; keep coverage and one real sample cell each. H3's
        // hierarchy nests, so a res-10 parent never straddles two groups and its area is
        // credited exactly once.
        let mut groups: BTreeMap<CellIndex, (Covered, CellIndex, BTreeSet<CellIndex>)> =
            BTreeMap::new();
        for cell in &cells {
            if let Some(parent) = cell.parent(*dedupe_res) {
                let entry = groups
                    .entry(parent)
                    .or_insert_with(|| (Covered::default(), *cell, BTreeSet::new()));
                entry.0.cells += 1;
                entry.0.explored_m2 += cell.area_m2();
                if let Some(filled) = cell.parent(FILLED_RES) {
                    entry.2.insert(filled);
                }
            }
        }
        for (covered, _, filled) in groups.values_mut() {
            covered.filled_m2 = filled.iter().map(|c| c.area_m2()).sum();
        }
        let to_geocode = groups
            .keys()
            .filter(|k| !cache.contains_key(&k.to_string()))
            .count();
        // Progress is logged via `log_progress` (never suppressed by `--silent`) because
        // this loop is rate-limited to one request per ~1.1s and can run for many minutes
        // in CI — otherwise the step looks hung with no output until it finishes.
        log_progress(&format!(
            "{level}: {} area(s), {} cached, {to_geocode} new to geocode (~{} at {:.1}s each)",
            groups.len(),
            groups.len() - to_geocode,
            fmt_dur((to_geocode as f64 * RATE_LIMIT.as_secs_f64()).ceil() as u64),
            RATE_LIMIT.as_secs_f64(),
        ));

        let started = Instant::now();
        let mut done = 0usize;
        for (parent, (covered, sample, _)) in &groups {
            let key = parent.to_string();
            if !cache.contains_key(&key) {
                let ll = LatLng::from(*sample);
                // Name the outcome for the progress line. Region names are already public
                // (they ship in regions.json); the sample's raw coordinates are not logged.
                let outcome = match reverse(ll.lat(), ll.lng(), *zoom, level) {
                    Ok(Some((region, geometry))) => {
                        let name = region.name.clone();
                        fresh_geometry.insert(region.osm_id, geometry);
                        cache.insert(key.clone(), Some(region));
                        cache_dirty = true;
                        format!("\"{name}\"")
                    }
                    Ok(None) => {
                        cache.insert(key.clone(), None);
                        cache_dirty = true;
                        "no polygon".to_string()
                    }
                    // Leave uncached on transient errors so it's retried next run.
                    Err(e) => {
                        log_warn(&format!("  reverse geocode failed for {key}: {e}"));
                        "failed".to_string()
                    }
                };
                done += 1;
                // ETA from the real average so far (network + rate-limit sleep), not the
                // nominal 1.1s, so it stays honest if Nominatim is slow.
                let remaining = to_geocode.saturating_sub(done);
                let eta = (started.elapsed().as_secs_f64() / done as f64 * remaining as f64) as u64;
                log_progress(&format!(
                    "  {level} {done}/{to_geocode}: {outcome} · {} elapsed, ~{} left",
                    fmt_dur(started.elapsed().as_secs()),
                    fmt_dur(eta),
                ));
                sleep(RATE_LIMIT);
            }
            if let Some(Some(region)) = cache.get(&key) {
                tally
                    .entry((region.level.clone(), region.osm_id))
                    .or_insert_with(|| (region.clone(), Covered::default()))
                    .1
                    .add(covered);
            }
        }
    }

    // District coverage gap-fill. At zoom 14, rural France has no sub-commune division,
    // so ~70% of district samples return no polygon and those stretches draw nothing.
    // Fall back to the commune (already fetched for the city level — no extra requests):
    // any cell whose fine district lookup found nothing is attributed to its commune under
    // the district level. Commune osm_ids are shared with the city level, so this merges
    // into an existing district entry when one exists rather than duplicating it.
    let district_res = LEVELS[0].2; // keep aligned with the "district" LEVELS entry
    let city_res = LEVELS[1].2; //     and the "city" entry
    // Gathered per commune before being tallied, so a res-10 parent shared by several
    // gap-filled cells is credited once instead of once per child.
    let mut gap: BTreeMap<i64, (CachedRegion, Covered, BTreeSet<CellIndex>)> = BTreeMap::new();
    for cell in &cells {
        let Some(d_parent) = cell.parent(district_res) else {
            continue;
        };
        // Only fill where the fine lookup returned no polygon (cached as None).
        if !matches!(cache.get(&d_parent.to_string()), Some(None)) {
            continue;
        }
        let Some(c_parent) = cell.parent(city_res) else {
            continue;
        };
        if let Some(Some(commune)) = cache.get(&c_parent.to_string())
            && commune.level == "city"
        {
            let entry = gap.entry(commune.osm_id).or_insert_with(|| {
                let mut as_district = commune.clone();
                as_district.level = "district".to_string();
                (as_district, Covered::default(), BTreeSet::new())
            });
            entry.1.cells += 1;
            entry.1.explored_m2 += cell.area_m2();
            if let Some(filled) = cell.parent(FILLED_RES) {
                entry.2.insert(filled);
            }
        }
    }
    for (osm_id, (region, mut covered, filled)) in gap {
        covered.filled_m2 = filled.iter().map(|c| c.area_m2()).sum();
        tally
            .entry(("district".to_string(), osm_id))
            .or_insert_with(|| (region, Covered::default()))
            .1
            .add(&covered);
    }

    let mut regions: Vec<Region> = tally
        .into_values()
        .map(|(region, covered)| {
            let geometry = fresh_geometry
                .get(&region.osm_id)
                .or_else(|| prior_geometry.get(&region.osm_id))
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            // Whole m² is far finer than any badge shows, and keeps the JSON compact.
            let round = |v: f64| v.round();
            Region {
                osm_id: region.osm_id,
                name: region.name,
                level: region.level,
                lat: region.lat,
                lon: region.lon,
                area: round(region.area),
                explored_m2: round(covered.explored_m2),
                filled_m2: round(covered.filled_m2),
                explored: covered.cells,
                geometry,
            }
        })
        .filter(|r| {
            r.level == "country"
                || r.explored > MIN_EXPLORED_CELLS
                || share(r.explored_m2, r.area) >= MIN_PERCENT
        })
        .collect();
    regions.sort_by(|a, b| {
        a.level.cmp(&b.level).then(
            share(b.explored_m2, b.area)
                .partial_cmp(&share(a.explored_m2, a.area))
                .unwrap(),
        )
    });

    // Compact, not pretty: every coordinate on its own line tripled the file, and this is
    // generated data inlined into the page — nobody reads the diff.
    fs::write(
        &regions_path,
        format!("{}\n", serde_json::to_string(&regions)?),
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
