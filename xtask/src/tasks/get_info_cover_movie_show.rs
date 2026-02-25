use crate::utils::{get_content_dirs, log_info, log_success};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Deserialize)]
struct TmdbResponse {
    id: serde_json::Value,
    title: Option<String>, // movies
    name: Option<String>,  // shows
    tagline: Option<String>,
    overview: Option<String>,
    release_date: Option<String>,       // movies
    first_air_date: Option<String>,     // shows
    runtime: Option<u32>,               // movies
    episode_run_time: Option<Vec<u32>>, // shows
    production_companies: Option<Vec<TmdbCompany>>,
    genres: Option<Vec<TmdbGenre>>,
    poster_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbCompany {
    name: String,
}

#[derive(Debug, Deserialize)]
struct TmdbGenre {
    name: String,
}

#[derive(Debug, Serialize)]
struct MediaData {
    title: Option<String>,
    tagline: Option<String>,
    id: serde_json::Value,
    overview: Option<String>,
    #[serde(rename = "releaseDate", skip_serializing_if = "Option::is_none")]
    release_date: Option<String>,
    runtime: Option<u32>,
    companies: Option<Vec<String>>,
    genres: Option<Vec<String>>,
}

pub fn run_get_data_movies_shows(content_type: &str) -> anyhow::Result<usize> {
    let api_key = std::env::var("TMDB_KEY").context("TMDB_KEY env var not set")?;
    let dirs = get_content_dirs(content_type)?;

    // TMDB endpoint differs between movies and shows
    let endpoint = if content_type == "movies" {
        "movie"
    } else {
        "tv"
    };

    for dir in &dirs {
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();

        log_info(&format!("Getting data for {content_type}/{dir_name}..."));

        let data_path = dir.join("_data.json");
        if data_path.exists() {
            log_info("Data already exists, skipping...");
            continue;
        }

        let md_path = dir.join(format!("{dir_name}.md"));
        let frontmatter = crate::utils::read_frontmatter(&md_path)
            .with_context(|| format!("reading {dir_name}.md"))?;

        let tmdb_id = frontmatter
            .get("tmdb")
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .with_context(|| format!("no tmdb id in frontmatter for {dir_name}"))?;

        let url = format!("https://api.themoviedb.org/3/{endpoint}/{tmdb_id}?api_key={api_key}");
        let response: TmdbResponse = ureq::get(&url).call()?.body_mut().read_json()?;

        // Shows use `name` and `first_air_date`, movies use `title` and `release_date`
        let title = response.title.or(response.name);
        let release_date = response.release_date.or(response.first_air_date);
        let runtime = response.runtime.or_else(|| {
            response
                .episode_run_time
                .as_deref()
                .and_then(|r| r.first().copied())
        });

        let result = MediaData {
            title,
            tagline: response.tagline,
            id: response.id,
            overview: response.overview,
            release_date,
            runtime,
            companies: response
                .production_companies
                .map(|cs| cs.into_iter().map(|c| c.name).collect()),
            genres: response
                .genres
                .map(|gs| gs.into_iter().map(|g| g.name).collect()),
        };

        fs::write(&data_path, serde_json::to_string_pretty(&result)?)?;
        log_success(&format!("Data saved for {dir_name}!"));

        // Download poster
        if let Some(poster_path) = response.poster_path {
            let poster_url = format!("https://image.tmdb.org/t/p/w780{poster_path}");
            let cover_path = dir.join("cover.png");
            crate::tasks::get_info_cover_book::download_and_save_image(&poster_url, &cover_path)
                .with_context(|| format!("downloading cover for {dir_name}"))?;
            log_success(&format!("Cover saved for {dir_name}!"));
        }
    }

    Ok(dirs.len())
}
