use crate::utils::{get_content_dirs, log_info, log_success};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct IgdbGame {
    pub id: u64,
    pub cover: Option<IgdbCover>,
    pub first_release_date: Option<i64>,
    pub genres: Option<Vec<IgdbNamedField>>,
    pub involved_companies: Option<Vec<IgdbInvolvedCompany>>,
    pub platforms: Option<Vec<IgdbPlatform>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct IgdbCover {
    pub id: u64,
    pub image_id: String,
}

#[derive(Debug, Deserialize)]
pub struct IgdbNamedField {
    pub id: u64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct IgdbInvolvedCompany {
    pub id: u64,
    pub company: IgdbCompany,
    pub developer: bool,
    pub publisher: bool,
    pub supporting: bool,
}

#[derive(Debug, Deserialize)]
pub struct IgdbCompany {
    pub id: u64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct IgdbPlatform {
    pub id: u64,
    pub abbreviation: Option<String>,
}

#[derive(Debug, Serialize)]
struct CompanyData {
    id: u64,
    name: String,
    role: String,
}

#[derive(Debug, Serialize)]
struct GameData {
    #[serde(skip_serializing_if = "Option::is_none")]
    first_release_date: Option<i64>,
    genres: Option<Vec<serde_json::Value>>,
    platforms: Option<Vec<serde_json::Value>>,
    companies: Vec<CompanyData>,
}

pub fn run_get_data_games() -> anyhow::Result<usize> {
    let igdb_client = std::env::var("IGDB_CLIENT").context("IGDB_CLIENT env var not set")?;
    let igdb_key = std::env::var("IGDB_KEY").context("IGDB_KEY env var not set")?;

    let access_token = get_access_token(&igdb_client, &igdb_key)?;

    let game_dirs = get_content_dirs("games")?;

    for game_dir in &game_dirs {
        let dir_name = game_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        log_info(&format!("Getting data for {dir_name}..."));

        let data_path = game_dir.join("_data.json");
        if data_path.exists() {
            log_info("Data already exists, skipping...");
            continue;
        }

        let md_path = game_dir.join(format!("{dir_name}.md"));
        let frontmatter = crate::utils::read_frontmatter(&md_path)
            .with_context(|| format!("reading {dir_name}.md"))?;

        let game_id = frontmatter
            .get("igdb")
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
            })
            .with_context(|| format!("no igdb id in frontmatter for {dir_name}"))?;

        let query = format!(
            r#"fields genres.name,first_release_date,cover.image_id,platforms.abbreviation,involved_companies.developer,involved_companies.publisher,involved_companies.supporting,involved_companies.company.name; where id = {game_id}; limit 1;"#
        );

        let response: Vec<IgdbGame> = ureq::post("https://api.igdb.com/v4/games")
            .header("Client-ID", &igdb_client)
            .header("Authorization", &format!("Bearer {access_token}"))
            .send(query.as_bytes())?
            .body_mut()
            .read_json()?;

        let game_data = response
            .into_iter()
            .next()
            .with_context(|| format!("IGDB returned no results for game id {game_id}"))?;

        let companies: Vec<CompanyData> = game_data
            .involved_companies
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .filter(|c| !c.supporting)
            .map(|c| CompanyData {
                id: c.company.id,
                name: c.company.name.clone(),
                role: if c.developer {
                    "developer".to_string()
                } else {
                    "publisher".to_string()
                },
            })
            .collect();

        let genres: Option<Vec<serde_json::Value>> =
            game_data.genres.map(|gs: Vec<IgdbNamedField>| {
                gs.into_iter()
                    .map(|g| serde_json::json!({ "id": g.id, "name": g.name }))
                    .collect()
            });

        let platforms: Option<Vec<serde_json::Value>> =
            game_data.platforms.map(|ps: Vec<IgdbPlatform>| {
                ps.into_iter()
                    .map(|p| serde_json::json!({ "id": p.id, "abbreviation": p.abbreviation }))
                    .collect()
            });

        let result = GameData {
            first_release_date: game_data.first_release_date,
            genres,
            platforms,
            companies,
        };

        fs::write(&data_path, serde_json::to_string_pretty(&result)?)?;
        log_success(&format!("Data saved for {dir_name}!"));

        // Download cover
        if let Some(cover) = game_data.cover {
            let cover_url = format!(
                "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/{}.png",
                cover.image_id
            );
            let cover_path = game_dir.join("cover.png");
            let bytes = ureq::get(&cover_url).call()?.body_mut().read_to_vec()?;
            fs::write(&cover_path, &bytes)?;
            log_success(&format!("Cover saved for {dir_name}!"));
        }
    }

    Ok(game_dirs.len())
}

fn get_access_token(client_id: &str, client_secret: &str) -> anyhow::Result<String> {
    let url = format!(
        "https://id.twitch.tv/oauth2/token?client_id={client_id}&client_secret={client_secret}&grant_type=client_credentials"
    );
    let response: TwitchTokenResponse = ureq::post(&url).send_empty()?.body_mut().read_json()?;
    Ok(response.access_token)
}
