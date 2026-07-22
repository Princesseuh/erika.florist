use std::collections::BTreeSet;
use std::fs;

use anyhow::Context;

use crate::utils::{log_info, log_success, workspace_root};

const CELLS_PATH: &str = "crates/website/content/scratchmap/cells.json";
const DEFAULT_API: &str = "https://api.erika.florist";

/// Pull the visited-cell set from the Cloudflare Worker and merge it into
/// `cells.json`. Only writes (and thus only triggers a commit) when something
/// new was discovered.
pub fn run_update_scratchmap() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    let token = std::env::var("SCRATCHMAP_TOKEN")
        .context("SCRATCHMAP_TOKEN must be set to read cells from the Worker")?;
    let base = std::env::var("SCRATCHMAP_API").unwrap_or_else(|_| DEFAULT_API.to_string());
    let url = format!("{}/scratchmap/cells", base.trim_end_matches('/'));

    log_info(&format!("Fetching visited cells from {url}"));
    let remote: Vec<String> = ureq::get(&url)
        .header("Authorization", &format!("Bearer {token}"))
        .call()
        .context("request to the scratch-map Worker failed")?
        .body_mut()
        .read_json()
        .context("Worker did not return a JSON array of cell IDs")?;

    let path = workspace_root().join(CELLS_PATH);
    let existing: Vec<String> = match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    let before = existing.len();
    let mut cells: BTreeSet<String> = existing.into_iter().collect();
    for cell in remote {
        cells.insert(cell);
    }

    let cells: Vec<String> = cells.into_iter().collect();
    let added = cells.len().saturating_sub(before);

    if added == 0 {
        log_success(&format!(
            "No new cells discovered ({before} total). Nothing to commit."
        ));
        return Ok(());
    }

    let mut json = serde_json::to_string_pretty(&cells)?;
    json.push('\n');
    fs::write(&path, json).with_context(|| format!("failed to write {}", path.display()))?;

    log_success(&format!(
        "Added {added} new cell{} — {} total discovered.",
        if added == 1 { "" } else { "s" },
        cells.len()
    ));
    Ok(())
}
