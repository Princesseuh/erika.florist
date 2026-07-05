use crate::utils::{log_info, log_success, log_warn, workspace_root};
use anyhow::Result;
use rayon::prelude::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::{env, fs};

pub fn run_optimize_covers(content_type: Option<&str>, dry_run: bool) -> Result<()> {
    let level = parse_level().unwrap_or(4);
    let root = workspace_root();
    let pattern = match content_type {
        Some(t) => root.join(format!("crates/website/content/{t}/**/cover.png")),
        None => root.join("crates/website/content/**/cover.png"),
    };
    let pattern = pattern.to_string_lossy().into_owned();

    let files: Vec<PathBuf> = glob::glob(&pattern)?.filter_map(Result::ok).collect();
    if files.is_empty() {
        log_warn("No cover PNGs found");
        return Ok(());
    }

    log_info(&format!(
        "Optimizing {} cover PNGs losslessly at level {level}{}",
        files.len(),
        if dry_run { " (dry run)" } else { "" }
    ));

    let options = oxipng::Options::from_preset(level);

    let total = files.len() as u64;
    let before = AtomicU64::new(0);
    let after = AtomicU64::new(0);
    let shrunk = AtomicU64::new(0);
    let failed = AtomicU64::new(0);
    let done = AtomicU64::new(0);

    files.par_iter().for_each(|path| {
        let input = match fs::read(path) {
            Ok(data) => data,
            Err(err) => {
                log_warn(&format!("read {}: {err}", path.display()));
                failed.fetch_add(1, Ordering::Relaxed);
                return;
            }
        };
        let original = input.len() as u64;
        before.fetch_add(original, Ordering::Relaxed);

        let optimized = match oxipng::optimize_from_memory(&input, &options) {
            Ok(bytes) => bytes,
            Err(err) => {
                log_warn(&format!("optimize {}: {err}", path.display()));
                failed.fetch_add(1, Ordering::Relaxed);
                after.fetch_add(original, Ordering::Relaxed);
                return;
            }
        };

        let new = optimized.len() as u64;
        if new < original {
            if !dry_run && let Err(err) = fs::write(path, &optimized) {
                log_warn(&format!("write {}: {err}", path.display()));
                failed.fetch_add(1, Ordering::Relaxed);
                after.fetch_add(original, Ordering::Relaxed);
                return;
            }
            after.fetch_add(new, Ordering::Relaxed);
            shrunk.fetch_add(1, Ordering::Relaxed);
        } else {
            after.fetch_add(original, Ordering::Relaxed);
        }

        let n = done.fetch_add(1, Ordering::Relaxed) + 1;
        if n.is_multiple_of(100) {
            log_info(&format!("… {n}/{total}"));
        }
    });

    let before = before.load(Ordering::Relaxed);
    let after = after.load(Ordering::Relaxed);
    let saved = before.saturating_sub(after);
    let pct = if before > 0 {
        saved as f64 / before as f64 * 100.0
    } else {
        0.0
    };

    log_success(&format!(
        "{} of {total} covers shrunk — {} → {} (saved {}, {pct:.1}%){}",
        shrunk.load(Ordering::Relaxed),
        human(before),
        human(after),
        human(saved),
        if dry_run {
            ", dry run — nothing written"
        } else {
            ""
        }
    ));

    let failed = failed.load(Ordering::Relaxed);
    if failed > 0 {
        log_warn(&format!("{failed} file(s) failed"));
    }
    Ok(())
}

fn parse_level() -> Option<u8> {
    let mut args = env::args();
    while let Some(arg) = args.next() {
        if arg == "--level" {
            return args.next()?.parse().ok();
        }
        if let Some(value) = arg.strip_prefix("--level=") {
            return value.parse().ok();
        }
    }
    None
}

fn human(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KiB", "MiB", "GiB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}
