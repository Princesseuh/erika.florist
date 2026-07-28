use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::DateTime;
use h3o::{CellIndex, LatLng, Resolution};
use serde::Deserialize;

use crate::utils::{log_info, log_success, log_warn, workspace_root};

const CELLS_PATH: &str = "crates/website/content/scratchmap/cells.json";

// Same line-fill guards as the live ingest in `crates/backend/src/scratchmap.rs`, so
// imported history paints trails exactly the way the phone does — a straight line
// between two fixes only when they're plausibly one continuous walk.
const MAX_HEX_GAP: i32 = 15; // ~650 m
const MAX_TIME_GAP: i64 = 600; // seconds

/// Google's raw signals carry their own accuracy radius. Beyond this a fix can't pick a
/// 50 m hex with any confidence, so it's dropped rather than painting the wrong cell.
const MAX_ACCURACY_M: f64 = 100.0;

/// A Google Maps timeline export (Settings → Location → Export Timeline data).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Timeline {
    #[serde(default)]
    semantic_segments: Vec<Segment>,
    #[serde(default)]
    raw_signals: Vec<RawSignal>,
}

/// One stretch of the timeline. Segments also describe visits and trips, but those only
/// carry the centroid of a place Google *inferred* you were at — not a coordinate anything
/// measured — so only the traced path is read here.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Segment {
    start_time: Option<String>,
    #[serde(default)]
    timeline_path: Vec<PathPoint>,
}

#[derive(Deserialize)]
struct PathPoint {
    point: String,
    time: Option<String>,
}

#[derive(Deserialize)]
struct RawSignal {
    position: Option<Position>,
}

/// A raw GPS/network fix. Note the capitalised `LatLng` — the export spells this key
/// differently here than in `semanticSegments`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Position {
    #[serde(rename = "LatLng")]
    lat_lng: String,
    accuracy_meters: Option<f64>,
    timestamp: Option<String>,
}

/// Counts for the summary line, so an import says what it actually consumed.
#[derive(Default)]
struct Stats {
    path_points: usize,
    raw_positions: usize,
    dropped_inaccurate: usize,
    unparsed: usize,
}

/// Coordinates ship as `"46.3318305°, -73.5421074°"` — degree signs and all.
fn parse_point(raw: &str) -> Option<LatLng> {
    let (lat, lng) = raw.split_once(',')?;
    let value = |s: &str| s.trim().trim_end_matches('°').trim().parse::<f64>().ok();
    LatLng::new(value(lat)?, value(lng)?).ok()
}

fn parse_cell(raw: &str) -> Option<CellIndex> {
    Some(parse_point(raw)?.to_cell(Resolution::Eleven))
}

fn parse_time(raw: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|t| t.timestamp())
}

/// Paint one continuous run of fixes, ordered by time: every cell they land in, plus the
/// straight line between consecutive fixes when they're close and recent enough to be one
/// stretch of walking. Runs are never joined to each other, so a drive or a gap in
/// tracking can't fabricate a trail. Returns how many cells were newly discovered.
fn paint_run(cells: &mut BTreeSet<CellIndex>, run: &[(CellIndex, i64)]) -> usize {
    let mut discovered = 0;
    let mut previous: Option<(CellIndex, i64)> = None;

    for &(cell, time) in run {
        if let Some((last_cell, last_time)) = previous {
            // Still in the same 50 m cell — already painted, nothing to bridge. The
            // earlier fix stays the anchor, as it does in the Worker, so time spent
            // standing still counts against the gap instead of resetting it.
            if last_cell == cell {
                continue;
            }
            let dt = time - last_time;
            if (0..=MAX_TIME_GAP).contains(&dt)
                && let Ok(distance) = last_cell.grid_distance(cell)
                && distance > 1
                && distance <= MAX_HEX_GAP
                && let Ok(path) = last_cell.grid_path_cells(cell)
            {
                for filled in path.flatten() {
                    if cells.insert(filled) {
                        discovered += 1;
                    }
                }
            }
        }
        if cells.insert(cell) {
            discovered += 1;
        }
        previous = Some((cell, time));
    }

    discovered
}

/// Collect one segment's traced path as runs. The path itself is a single continuous run;
/// a point whose own time is missing can't be bridged, so it's split off on its own.
fn segment_runs(segment: &Segment, stats: &mut Stats) -> Vec<Vec<(CellIndex, i64)>> {
    let mut runs = Vec::new();

    let start = segment.start_time.as_deref().and_then(parse_time);

    let mut path: Vec<(CellIndex, i64)> = Vec::with_capacity(segment.timeline_path.len());
    for point in &segment.timeline_path {
        let Some(cell) = parse_cell(&point.point) else {
            stats.unparsed += 1;
            continue;
        };
        // A path point without its own time can still be painted; it just can't bridge.
        let Some(time) = point.time.as_deref().and_then(parse_time).or(start) else {
            runs.push(vec![(cell, 0)]);
            stats.path_points += 1;
            continue;
        };
        path.push((cell, time));
        stats.path_points += 1;
    }
    if !path.is_empty() {
        path.sort_by_key(|(_, time)| *time);
        runs.push(path);
    }

    runs
}

/// The raw fixes, sorted into one long run. The time-gap guard splits it back into real
/// stretches on its own, so there's nothing to segment by hand.
fn raw_run(signals: &[RawSignal], stats: &mut Stats) -> Vec<(CellIndex, i64)> {
    let mut run: Vec<(CellIndex, i64)> = Vec::new();

    for signal in signals {
        // Wi-Fi scans and activity records carry no coordinates — only positions do.
        let Some(position) = signal.position.as_ref() else {
            continue;
        };
        if position.accuracy_meters.unwrap_or(0.0) > MAX_ACCURACY_M {
            stats.dropped_inaccurate += 1;
            continue;
        }
        let (Some(cell), Some(time)) = (
            parse_cell(&position.lat_lng),
            position.timestamp.as_deref().and_then(parse_time),
        ) else {
            stats.unparsed += 1;
            continue;
        };
        run.push((cell, time));
        stats.raw_positions += 1;
    }

    run.sort_by_key(|(_, time)| *time);
    run
}

/// Read a Google Maps timeline export, reduce every position it actually recorded to its
/// H3 res-11 cell, and merge those into `cells.json`. Like the Worker, this only ever adds
/// cells — nothing already discovered is dropped, and no raw coordinate is written anywhere.
pub fn run_import_timeline(path: &str, dry_run: bool) -> Result<()> {
    let source = Path::new(path);
    log_info(&format!(
        "Reading timeline export from {}",
        source.display()
    ));

    let contents = fs::read_to_string(source)
        .with_context(|| format!("failed to read {}", source.display()))?;
    let timeline: Timeline =
        serde_json::from_str(&contents).context("not a Google Maps timeline export")?;

    let cells_path = workspace_root().join(CELLS_PATH);
    let existing: Vec<String> = match fs::read_to_string(&cells_path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let before = existing.len();
    let mut cells: BTreeSet<CellIndex> = existing.iter().filter_map(|id| id.parse().ok()).collect();
    if cells.len() != before {
        log_warn(&format!(
            "{} cell id(s) in cells.json didn't parse and were dropped",
            before - cells.len()
        ));
    }

    let mut stats = Stats::default();
    let mut discovered = 0;

    for segment in &timeline.semantic_segments {
        for run in segment_runs(segment, &mut stats) {
            discovered += paint_run(&mut cells, &run);
        }
    }
    discovered += paint_run(&mut cells, &raw_run(&timeline.raw_signals, &mut stats));

    log_info(&format!(
        "Consumed {} traced path point(s) and {} raw fix(es).",
        stats.path_points, stats.raw_positions
    ));
    if stats.dropped_inaccurate > 0 || stats.unparsed > 0 {
        log_info(&format!(
            "Skipped {} fix(es) vaguer than {MAX_ACCURACY_M} m and {} unreadable location(s).",
            stats.dropped_inaccurate, stats.unparsed
        ));
    }

    if discovered == 0 {
        log_success(&format!(
            "No new cells in this export ({before} already discovered). Nothing to write."
        ));
        return Ok(());
    }

    if dry_run {
        log_success(&format!(
            "Dry run: would add {discovered} new cell{} — {} total discovered.",
            if discovered == 1 { "" } else { "s" },
            cells.len()
        ));
        return Ok(());
    }

    let ids: Vec<String> = cells.iter().map(|cell| cell.to_string()).collect();
    let mut json = serde_json::to_string_pretty(&ids)?;
    json.push('\n');
    fs::write(&cells_path, json)
        .with_context(|| format!("failed to write {}", cells_path.display()))?;

    log_success(&format!(
        "Added {discovered} new cell{} — {} total discovered. Run `cargo xtask update-regions` next.",
        if discovered == 1 { "" } else { "s" },
        ids.len()
    ));
    Ok(())
}
