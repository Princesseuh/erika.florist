use crate::utils::workspace_root;
use anyhow::Context;
use std::collections::BTreeSet;
use std::fs;
use std::process::Command;

pub fn run_subset_fonts(title: bool, content: bool) -> anyhow::Result<()> {
    if !title && !content {
        anyhow::bail!("Pass --title and/or --content to subset fonts");
    }

    let root = workspace_root();
    let font_dir = root.join("crates/website/src/assets/fonts");

    // Collect characters from all markdown files
    let (title_letters, content_letters) = collect_characters(&root)?;

    if title {
        subset_title_font(&font_dir, &title_letters)?;
    }

    if content {
        subset_content_font(&font_dir, &content_letters)?;
    }

    Ok(())
}

fn collect_characters(root: &std::path::Path) -> anyhow::Result<(BTreeSet<char>, BTreeSet<char>)> {
    // Pre-seed content letters (mirrors the TS script)
    let pre_seed = ["erika", "articles", "projects", "catalogue"];
    let mut content_letters: BTreeSet<char> = pre_seed.iter().flat_map(|s| s.chars()).collect();
    let mut title_letters: BTreeSet<char> = "erika".chars().collect();

    // Glob all markdown files under crates/website/content/
    let pattern = root
        .join("crates/website/content/**/*.md")
        .to_string_lossy()
        .into_owned();

    for path in glob::glob(&pattern)? {
        let path = path?;
        let raw =
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;

        // Parse frontmatter manually using gray_matter
        use gray_matter::Matter;
        use gray_matter::engine::YAML;
        let matter = Matter::<YAML>::new();
        let parsed = matter.parse(&raw);

        // Title characters go into titleLetters
        if let Some(data) = &parsed.data {
            if let Ok(title) = data["title"].as_string() {
                for ch in title.chars() {
                    title_letters.insert(ch);
                }
            }
            if let Ok(tagline) = data["tagline"].as_string() {
                for ch in tagline.chars() {
                    content_letters.insert(ch);
                }
            }
        }

        // Body content goes into contentLetters
        for ch in parsed.content.chars() {
            content_letters.insert(ch);
        }
    }

    Ok((title_letters, content_letters))
}

fn subset_title_font(
    font_dir: &std::path::Path,
    title_letters: &BTreeSet<char>,
) -> anyhow::Result<()> {
    // Step 1: instance the variable font
    run_command(
        "fonttools",
        &[
            "varLib.instancer",
            "-q",
            "-o",
            "InterResultTemp.woff2",
            "InterOriginal.woff2",
            "wght=600",
            "opsz=32",
        ],
        font_dir,
    )
    .context("fonttools varLib.instancer (title)")?;

    // Step 2: subset
    let text: String = title_letters.iter().collect();
    run_command(
        "pyftsubset",
        &[
            "InterResultTemp.woff2",
            &format!("--text={text}"),
            "--layout-features=ss08,kern",
            "--flavor=woff2",
            "--output-file=InterResult.woff2",
        ],
        font_dir,
    )
    .context("pyftsubset (title)")?;

    // Step 3: remove temp file
    fs::remove_file(font_dir.join("InterResultTemp.woff2"))?;

    eprintln!("Title font subset complete.");
    Ok(())
}

fn subset_content_font(
    font_dir: &std::path::Path,
    content_letters: &BTreeSet<char>,
) -> anyhow::Result<()> {
    // Step 1: instance
    run_command(
        "fonttools",
        &[
            "varLib.instancer",
            "-q",
            "-o",
            "IBMPlexResultTemp.woff2",
            "IBMPlexOriginal.woff2",
            "wght=400:500",
            "wdth=100",
        ],
        font_dir,
    )
    .context("fonttools varLib.instancer (content)")?;

    // Step 2: write subset text file (strip newlines and emoji, mirroring the TS script)
    let raw_text: String = content_letters.iter().collect();
    let filtered: String = raw_text
        .chars()
        .filter(|&ch| {
            let cp = ch as u32;
            !matches!(ch, '\n' | '\r')
                && !(0x2700..=0x27BF).contains(&cp)
                && !(0xE000..=0xF8FF).contains(&cp)
                && !(0x2011..=0x26FF).contains(&cp)
                // Surrogate pairs / emoji blocks (represented by their scalar value ranges)
                && !(0x1F300..=0x1F9FF).contains(&cp)
        })
        .collect();

    let subset_txt = font_dir.join("IBMPlexSubset.txt");
    fs::write(&subset_txt, &filtered)?;

    // Step 3: subset
    run_command(
        "pyftsubset",
        &[
            "IBMPlexResultTemp.woff2",
            "--text-file=IBMPlexSubset.txt",
            "--layout-features=kern",
            "--flavor=woff2",
            "--output-file=IBMPlexResult.woff2",
        ],
        font_dir,
    )
    .context("pyftsubset (content)")?;

    // Step 4: clean up
    fs::remove_file(&subset_txt)?;
    fs::remove_file(font_dir.join("IBMPlexResultTemp.woff2"))?;

    eprintln!("Content font subset complete.");
    Ok(())
}

fn run_command(program: &str, args: &[&str], cwd: &std::path::Path) -> anyhow::Result<()> {
    let status = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .status()
        .with_context(|| format!("failed to start `{program}`"))?;

    if !status.success() {
        anyhow::bail!("`{program}` exited with status {status}");
    }
    Ok(())
}
