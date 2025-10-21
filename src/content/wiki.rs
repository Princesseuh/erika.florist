use std::{collections::HashMap, error::Error, process::Command, sync::Arc, time::Instant};

use chrono::NaiveDate;
use maudit::{
    content::{
        ContentContext, ContentEntry, Entry, MarkdownOptions, markdown_entry,
        parse_markdown_with_frontmatter, render_markdown,
    },
    is_dev,
    route::PageContext,
};
use serde::Deserialize;

#[derive(Debug)]
#[markdown_entry]
pub struct WikiEntry {
    pub title: String,
    pub tagline: Option<String>,
    pub max_depth_toc: Option<u32>,
    pub navigation: WikiNavigation,
    pub last_modified: Option<WikiLastModified>,
}

impl WikiEntry {
    pub fn add_last_modified_info(&mut self, last_modified: WikiLastModified) {
        self.last_modified = Some(last_modified);
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct WikiLastModified {
    pub date: NaiveDate, // YYYY-MM-DD
    pub commit_url: String,
}

#[derive(Debug, Deserialize)]
pub struct WikiNavigation {
    pub label: Option<String>,
    pub category: String,
    pub hidden: Option<bool>,
    pub order: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct GitInfo {
    pub date: String,
    pub r#ref: String,
}

pub fn get_git_info() -> Result<HashMap<String, GitInfo>, Box<dyn Error>> {
    let output = Command::new("bash")
        .arg("./scripts/getLastModified.sh")
        .output()?;

    let stdout = String::from_utf8(output.stdout)?;

    let mut git_info_map = HashMap::new();

    for info in stdout.split(';').filter(|s| !s.trim().is_empty()) {
        let mut parts = info.split('|');
        let file = parts.next().map(str::to_string);
        let date = parts.next().map(str::trim).map(str::to_string);
        let r#ref = parts.next().map(str::to_string);

        match (file, date, r#ref) {
            (Some(file), Some(date), Some(r#ref))
                if !file.is_empty() && !date.is_empty() && !r#ref.is_empty() =>
            {
                git_info_map.insert(file.clone(), GitInfo { date, r#ref });
            }
            _ => return Err(format!("Couldn't parse file info from {}", info).into()),
        }
    }

    Ok(git_info_map)
}

pub fn wiki_add_modified_info(
    entries: &[Entry<WikiEntry>],
    options: MarkdownOptions,
) -> Vec<Entry<WikiEntry>> {
    let options = Arc::new(options);
    let start = Instant::now();
    let git_info = match get_git_info() {
        Ok(info) => info,
        Err(e) => {
            let duration = start.elapsed();
            eprintln!("Failed to get git info: {} (took: {:?})", e, duration);
            HashMap::new()
        }
    };

    entries
        .iter()
        .map(|entry| {
            let id = entry.id.clone();
            let file_path = entry.file_path.clone().unwrap();
            let raw_content = entry.raw_content.clone().unwrap_or_default();
            let opts = options.clone();

            let data_loader = {
                let content = raw_content.clone();
                let file_path = file_path.clone();
                let git_info_for_file = git_info
                    .get(&file_path.to_string_lossy().to_string())
                    .cloned();

                Box::new(move |_: &mut dyn ContentContext| {
                    let mut entry = parse_markdown_with_frontmatter::<WikiEntry>(&content);
                    if let Some(ref info) = git_info_for_file {
                        let parsed_date = NaiveDate::parse_from_str(&info.date, "%Y-%m-%d")
                            .unwrap_or_else(|e| {
                                eprintln!("Failed to parse date: {}, {}", info.date, e);
                                NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
                            });

                        entry.add_last_modified_info(WikiLastModified {
                            date: parsed_date,
                            commit_url: format!(
                                "https://github.com/Princesseuh/erika.florist/commit/{}",
                                info.r#ref
                            ),
                        });
                    } else if is_dev() {
                        entry.add_last_modified_info(WikiLastModified {
                            date: NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
                            commit_url: "#".to_string(),
                        });
                    } else {
                        eprintln!(
                            "No git info found for file: {}",
                            file_path.to_string_lossy()
                        );
                    }

                    entry
                })
            };

            let renderer = {
                let path = file_path.clone();
                let opts = opts.clone();
                Box::new(move |content: &str, route_ctx: &mut PageContext| {
                    render_markdown(content, Some(&*opts), Some(&path), Some(route_ctx))
                })
            };

            Entry::create_lazy(
                id,
                Some(renderer),
                Some(raw_content),
                data_loader,
                Some(file_path),
            )
        })
        .collect()
}
