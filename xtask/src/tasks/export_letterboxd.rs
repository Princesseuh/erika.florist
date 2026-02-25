use crate::utils::{get_content_dirs, log_info, log_success, log_warn};
use anyhow::Context;
use std::fs;

/// Generates a Letterboxd-compatible CSV string from all movie content directories.
pub fn get_letterboxd_csv() -> anyhow::Result<String> {
    let movie_dirs = get_content_dirs("movies")?;
    let mut tmdb_ids: Vec<String> = Vec::new();

    log_info(&format!("Processing {} movies...", movie_dirs.len()));

    for movie_dir in &movie_dirs {
        let dir_name = movie_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        let md_path = movie_dir.join(format!("{dir_name}.md"));
        log_info(&format!("Getting tmdb id for movies/{dir_name}..."));

        let frontmatter = crate::utils::read_frontmatter(&md_path)
            .with_context(|| format!("reading {dir_name}.md"))?;

        match frontmatter.get("tmdb").and_then(|v| v.as_str()) {
            Some(id) => {
                tmdb_ids.push(id.to_string());
                log_info(&format!("Found TMDB ID: {id} for {dir_name}"));
            }
            None => {
                // Try numeric
                if let Some(id) = frontmatter.get("tmdb").and_then(|v| v.as_i64()) {
                    tmdb_ids.push(id.to_string());
                    log_info(&format!("Found TMDB ID: {id} for {dir_name}"));
                } else {
                    log_warn(&format!("No TMDB ID found for {dir_name}"));
                }
            }
        }
    }

    let csv = std::iter::once("tmdbID".to_string())
        .chain(tmdb_ids.iter().cloned())
        .collect::<Vec<_>>()
        .join("\n");

    log_success(&format!("Generated CSV with {} movie IDs", tmdb_ids.len()));
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
