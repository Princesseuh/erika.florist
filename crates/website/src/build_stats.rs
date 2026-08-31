use std::{path::Path, time::Duration};

use chrono::{SecondsFormat, Utc};
use maudit::BuildOutput;
use serde::{Deserialize, Serialize};

const HISTORY_PATH: &str = "build-history.json";
const STATS_PATH: &str = "dist/build-stats.json";

#[derive(Serialize, Deserialize)]
struct Build {
    date: String,
    commit: String,
    duration_ms: u64,
    pages: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    run: Option<u64>,
}

#[derive(Serialize)]
struct Marker {
    date: &'static str,
    label: &'static str,
}

const MARKERS: &[Marker] = &[
    Marker {
        date: "2026-06-08",
        label: "Image cache dropped",
    },
    Marker {
        date: "2026-07-05",
        label: "Image cache restored",
    },
    Marker {
        date: "2026-07-22",
        label: "Cache mtimes restored",
    },
];

#[derive(Serialize)]
struct Stats<'a> {
    builds: &'a [Build],
    markers: &'static [Marker],
}

fn current_commit() -> String {
    if let Ok(sha) = std::env::var("GITHUB_SHA") {
        return sha.chars().take(8).collect();
    }

    std::process::Command::new("git")
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map_or_else(String::new, |sha| sha.trim().to_owned())
}

pub fn record(output: &BuildOutput, elapsed: Duration) -> Result<(), Box<dyn std::error::Error>> {
    // Starting over on a parse error would overwrite the history in CI.
    let mut builds: Vec<Build> = match std::fs::read_to_string(HISTORY_PATH) {
        Ok(raw) => serde_json::from_str(&raw)?,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(err) => return Err(err.into()),
    };

    // A dev rebuild is incremental and partial, so it charts as a bogus low outlier.
    if !maudit::is_dev() {
        builds.push(Build {
            date: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            commit: current_commit(),
            duration_ms: elapsed.as_millis() as u64,
            pages: output.pages.len(),
            run: std::env::var("GITHUB_RUN_ID")
                .ok()
                .and_then(|id| id.parse().ok()),
        });
    }

    // Only CI builds join the permanent record; local rebuilds would drown it out.
    if std::env::var_os("CI").is_some() {
        std::fs::write(
            HISTORY_PATH,
            format!("{}\n", serde_json::to_string_pretty(&builds)?),
        )?;
    }

    let stats_path = Path::new(STATS_PATH);
    if let Some(parent) = stats_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        stats_path,
        serde_json::to_string(&Stats {
            builds: &builds,
            markers: MARKERS,
        })?,
    )?;

    Ok(())
}
