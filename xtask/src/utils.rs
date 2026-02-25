use std::path::{Path, PathBuf};
use std::{env, fs};

/// Returns the workspace root (the directory containing the top-level Cargo.toml).
pub fn workspace_root() -> PathBuf {
    // When invoked via `cargo xtask`, CARGO_MANIFEST_DIR points to the xtask crate.
    // The workspace root is one level up.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest_dir)
        .parent()
        .expect("xtask manifest has no parent directory")
        .to_path_buf()
}

/// Returns the subdirectories of `crates/website/content/{type}/`.
pub fn get_content_dirs(content_type: &str) -> anyhow::Result<Vec<PathBuf>> {
    let root = workspace_root();
    let dir = root.join(format!("crates/website/content/{content_type}"));
    let mut dirs = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            dirs.push(entry.path());
        }
    }
    dirs.sort();
    Ok(dirs)
}

/// Prints a timestamped SUCCESS line.
pub fn log_success(msg: &str) {
    eprintln!("\x1b[1;32mSUCCESS\x1b[0m {msg}");
}

/// Prints a timestamped ERROR line.
#[allow(dead_code)]
pub fn log_error(msg: &str) {
    eprintln!("\x1b[1;31mERROR\x1b[0m {msg}");
}

/// Prints a timestamped WARNING line.
pub fn log_warn(msg: &str) {
    eprintln!("\x1b[1;33mWARNING\x1b[0m {msg}");
}

/// Prints a timestamped INFO line (suppressed by `--silent`).
pub fn log_info(msg: &str) {
    let silent = env::args().any(|a| a == "--silent");
    if !silent {
        eprintln!("\x1b[90mINFO\x1b[0m {msg}");
    }
}

/// Reads YAML frontmatter from a markdown file and returns the parsed value as `serde_json::Value`.
pub fn read_frontmatter(path: &Path) -> anyhow::Result<serde_json::Value> {
    use gray_matter::engine::YAML;
    use gray_matter::Matter;

    let content = fs::read_to_string(path)?;
    let matter = Matter::<YAML>::new();
    let result = matter.parse(&content);
    match result.data {
        Some(pod) => {
            // gray_matter's Pod can be deserialized into any serde type
            let value: serde_json::Value = pod.deserialize()?;
            Ok(value)
        }
        None => Ok(serde_json::Value::Object(Default::default())),
    }
}
