use crate::utils::{get_content_dirs, log_info, log_success, log_warn};
use anyhow::Context;
use std::fs;

/// Maps a catalogue rating word to a Letterboxd star rating on the 0.5–5 scale.
///
/// Letterboxd's CSV import has no field for favorites, so masterpiece tops out at
/// 5★ and loved sits just below at 4.5★ to stay distinct from it.
fn rating_to_stars(rating: &str) -> Option<&'static str> {
    match rating {
        "hated" => Some("1"),
        "disliked" => Some("2"),
        "okay" => Some("3"),
        "liked" => Some("4"),
        "loved" => Some("4.5"),
        "masterpiece" => Some("5"),
        _ => None,
    }
}

/// Returns `value` if it is an ISO `YYYY-MM-DD` date, otherwise `""`.
///
/// `finishedDate` is often `N/A` (or absent), which Letterboxd should treat as a
/// rating with no diary date rather than a malformed `WatchedDate`.
fn as_watched_date(value: &str) -> &str {
    let bytes = value.as_bytes();
    let is_iso_date = value.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && value
            .char_indices()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());

    if is_iso_date { value } else { "" }
}

/// Generates a Letterboxd-compatible CSV string from all movie content directories.
pub fn get_letterboxd_csv() -> anyhow::Result<String> {
    let movie_dirs = get_content_dirs("movies")?;
    let mut rows: Vec<String> = Vec::new();

    log_info(&format!("Processing {} movies...", movie_dirs.len()));

    for movie_dir in &movie_dirs {
        let dir_name = movie_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        let md_path = movie_dir.join(format!("{dir_name}.md"));
        log_info(&format!("Reading movies/{dir_name}..."));

        let frontmatter = crate::utils::read_frontmatter(&md_path)
            .with_context(|| format!("reading {dir_name}.md"))?;

        let tmdb_id = frontmatter.get("tmdb").and_then(|v| {
            v.as_str()
                .map(str::to_string)
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        });

        let Some(tmdb_id) = tmdb_id else {
            log_warn(&format!("No TMDB ID found for {dir_name}"));
            continue;
        };

        let stars = frontmatter
            .get("rating")
            .and_then(|v| v.as_str())
            .and_then(rating_to_stars)
            .unwrap_or_else(|| {
                log_warn(&format!("No/unknown rating for {dir_name}"));
                ""
            });

        let watched = frontmatter
            .get("finishedDate")
            .and_then(|v| v.as_str())
            .map(as_watched_date)
            .unwrap_or_default();

        rows.push(format!("{tmdb_id},{stars},{watched}"));
        log_info(&format!(
            "Found TMDB ID: {tmdb_id} (rating: {stars}, watched: {watched}) for {dir_name}"
        ));
    }

    let csv = std::iter::once("tmdbID,Rating,WatchedDate".to_string())
        .chain(rows.iter().cloned())
        .collect::<Vec<_>>()
        .join("\n");

    log_success(&format!("Generated CSV with {} movie entries", rows.len()));
    Ok(csv)
}

pub fn run_export_letterboxd() -> anyhow::Result<()> {
    let csv = get_letterboxd_csv()?;

    let output_path = std::env::current_dir()?.join("letterboxd-export.csv");
    fs::write(&output_path, &csv)?;
    log_success(&format!("CSV exported to: {}", output_path.display()));

    println!("\nPreview:");
    let lines: Vec<&str> = csv.lines().collect();
    let preview_count = lines.len().min(10);
    for line in &lines[..preview_count] {
        println!("{line}");
    }
    if lines.len() > 10 {
        println!("... and {} more entries", lines.len() - 10);
    }

    Ok(())
}
