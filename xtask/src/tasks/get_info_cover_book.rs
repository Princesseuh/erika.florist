use crate::utils::{get_content_dirs, log_info, log_success, log_warn};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Deserialize)]
struct OpenLibraryResponse {
    details: OpenLibraryDetails,
    thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenLibraryDetails {
    title: String,
    subtitle: Option<String>,
    number_of_pages: Option<u32>,
    publish_date: Option<String>,
    authors: Option<Vec<OLAuthor>>,
    contributors: Option<Vec<OLContributor>>,
    publishers: Option<Vec<String>>,
    works: Option<Vec<OLWork>>,
}

#[derive(Debug, Deserialize)]
struct OLWork {
    key: String,
}

#[derive(Debug, Deserialize)]
struct OLSearchResponse {
    docs: Vec<OLSearchDoc>,
}

#[derive(Debug, Deserialize)]
struct OLSearchDoc {
    first_publish_year: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct OLAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
struct OLContributor {
    name: String,
    role: String,
}

#[derive(Debug, Serialize)]
struct BookData {
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    subtitle: Option<String>,
    authors: Vec<String>,
    contributors: Option<Vec<serde_json::Value>>,
    publishers: Option<Vec<String>>,
    pages: Option<u32>,
    #[serde(rename = "publishDate", skip_serializing_if = "Option::is_none")]
    publish_date: Option<i64>,
}

/// Open Library stalls connections often enough that every request here needs a deadline —
/// without one a single hung socket blocks the whole run indefinitely.
pub fn http_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .build()
        .into()
}

pub fn run_get_data_books() -> anyhow::Result<usize> {
    let book_dirs = get_content_dirs("books")?;
    let agent = http_agent();

    for book_dir in &book_dirs {
        let dir_name = book_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        log_info(&format!("Getting data for {dir_name}..."));

        let data_path = book_dir.join("_data.json");
        if data_path.exists() {
            log_info("Data already exists, skipping...");
            continue;
        }

        let md_path = book_dir.join(format!("{dir_name}.md"));
        let frontmatter = crate::utils::read_frontmatter(&md_path)
            .with_context(|| format!("reading {dir_name}.md"))?;

        let isbn = frontmatter
            .get("isbn")
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .with_context(|| format!("no isbn in frontmatter for {dir_name}"))?;

        let url = format!(
            "https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=details&format=json"
        );
        let response: serde_json::Value = agent.get(&url).call()?.body_mut().read_json()?;

        let key = format!("ISBN:{isbn}");
        let entry: OpenLibraryResponse = serde_json::from_value(response[&key].clone())
            .with_context(|| format!("parsing Open Library response for {dir_name} (key {key})"))?;

        // Filter out translator contributors from the authors list
        let contributors = entry.details.contributors.as_deref().unwrap_or(&[]);
        let authors: Vec<String> = entry
            .details
            .authors
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .filter(|author| {
                !contributors
                    .iter()
                    .any(|c| c.name == author.name && c.role.to_lowercase() == "translator")
            })
            .map(|a| a.name.clone())
            .collect();

        // The edition's own publish date is whenever that printing happened, which sorts
        // reprints away from the rest of a series. Prefer the work's first publication year.
        let publish_date_unix = match entry.details.works.as_deref().unwrap_or(&[]).first() {
            Some(work) => {
                let year = first_publish_year(&work.key)
                    .with_context(|| format!("first publish year for {dir_name}"))?;
                chrono_parse_date(&year.to_string())
            }
            None => entry
                .details
                .publish_date
                .as_deref()
                .and_then(chrono_parse_date),
        };

        let contributors_json: Option<Vec<serde_json::Value>> =
            entry.details.contributors.map(|cs| {
                cs.into_iter()
                    .map(|c| serde_json::json!({ "name": c.name, "role": c.role }))
                    .collect()
            });

        let result = BookData {
            title: entry.details.title,
            subtitle: entry.details.subtitle,
            authors,
            contributors: contributors_json,
            publishers: entry.details.publishers,
            pages: entry.details.number_of_pages,
            publish_date: publish_date_unix,
        };

        fs::write(&data_path, serde_json::to_string_pretty(&result)?)?;
        log_success(&format!("Data saved for {dir_name}!"));

        // Download cover
        match entry.thumbnail_url {
            None => {
                log_warn(&format!("No cover found for {dir_name}, skipping..."));
                continue;
            }
            Some(thumb_url) => {
                let cover_url = thumb_url.replace("-S", "-L");
                let cover_path = book_dir.join("cover.png");
                download_and_save_image(&agent, &cover_url, &cover_path)
                    .with_context(|| format!("downloading cover for {dir_name}"))?;
                log_success(&format!("Cover saved for {dir_name}!"));
            }
        }
    }

    Ok(book_dirs.len())
}

/// Looks up the year a work was *first* published. Open Library leaves `first_publish_date` empty
/// on most work records, but the search index derives the year across every edition.
///
/// The search endpoint is slow and rate limited, and it hangs outright often enough that a global
/// timeout is required. Errors are surfaced rather than swallowed: falling back to the edition's
/// own print date silently would reorder a series by reprint year.
fn first_publish_year(work_key: &str) -> anyhow::Result<i32> {
    let url = format!(
        "https://openlibrary.org/search.json?q=key:%22{work_key}%22&fields=first_publish_year&limit=1"
    );
    let agent = http_agent();

    let mut last_error = None;
    for attempt in 0..4 {
        match agent.get(&url).call() {
            Ok(mut response) => match response.body_mut().read_json::<OLSearchResponse>() {
                Ok(body) => {
                    return body
                        .docs
                        .first()
                        .and_then(|doc| doc.first_publish_year)
                        .with_context(|| format!("no first_publish_year for {work_key}"));
                }
                Err(err) => last_error = Some(anyhow::Error::from(err)),
            },
            Err(err) => last_error = Some(anyhow::Error::from(err)),
        }
        std::thread::sleep(std::time::Duration::from_secs(2 * (attempt + 1)));
    }

    Err(last_error
        .unwrap_or_else(|| anyhow::anyhow!("unreachable"))
        .context(format!("looking up first publish year for {work_key}")))
}

/// Parses a flexible date string (e.g. "January 1, 2005", "2005", "2005-01-01") into a Unix
/// timestamp. Returns `None` if the string can't be parsed.
fn chrono_parse_date(s: &str) -> Option<i64> {
    let s = s.trim();
    let to_timestamp =
        |d: chrono::NaiveDate| d.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc().timestamp());

    for fmt in ["%B %d, %Y", "%Y-%m-%d"] {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(s, fmt) {
            return to_timestamp(date);
        }
    }

    // NaiveDate rejects partial dates, so supply the missing components. Open Library gives a
    // bare year ("1983") or month and year ("November 1988") for most older editions.
    for (padded, fmt) in [
        (format!("{s} 1"), "%B %Y %d"),
        (format!("{s}-01-01"), "%Y-%m-%d"),
    ] {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&padded, fmt) {
            return to_timestamp(date);
        }
    }

    None
}

/// Downloads an image from `url`, converts to PNG if necessary, and writes to `dest`.
pub fn download_and_save_image(agent: &ureq::Agent, url: &str, dest: &Path) -> anyhow::Result<()> {
    let bytes = agent.get(url).call()?.body_mut().read_to_vec()?;
    if url.to_lowercase().ends_with(".png") {
        fs::write(dest, &bytes)?;
    } else {
        let img = image::load_from_memory(&bytes).context("decoding image")?;
        img.save(dest).context("saving image as PNG")?;
    }
    Ok(())
}
