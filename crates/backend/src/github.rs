use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::*;

#[derive(Debug, Deserialize)]
pub struct CommitForm {
    pub r#type: String,
    pub name: String,
    pub rating: String,
    pub date: String,
    #[serde(rename = "source-id")]
    pub source_id: String,
    #[serde(rename = "platform-select", default)]
    pub platform_select: String,
    pub comment: String,
    #[serde(rename = "skip-ci", default)]
    pub skip_ci: String,
}

impl CommitForm {
    pub fn from_formdata(form_data: &FormData) -> Result<Self, Error> {
        Ok(CommitForm {
            r#type: form_data.get_field("type").unwrap_or_default(),
            name: form_data.get_field("name").unwrap_or_default(),
            rating: form_data.get_field("rating").unwrap_or_default(),
            date: form_data.get_field("date").unwrap_or_default(),
            source_id: form_data.get_field("source-id").unwrap_or_default(),
            platform_select: form_data.get_field("platform-select").unwrap_or_default(),
            comment: form_data.get_field("comment").unwrap_or_default(),
            skip_ci: form_data.get_field("skip-ci").unwrap_or_default(),
        })
    }
}

#[derive(Serialize)]
pub struct GitHubRequest {
    message: String,
    content: String,
    committer: GitHubCommitter,
}

#[derive(Serialize)]
pub struct GitHubCommitter {
    name: String,
    email: String,
}

pub async fn check_if_file_exists(
    token: &str,
    repo: &str,
    path_type: &str,
    slug: &str,
) -> Result<bool, Error> {
    let url = format!(
        "https://api.github.com/repos/{}/contents/crates/website/content/{}/{}/{}.md",
        repo, path_type, slug, slug
    );

    let req = Request::new_with_init(&url, RequestInit::new().with_method(Method::Get))?;
    req.headers().set("Accept", "application/vnd.github+json")?;
    req.headers().set("User-Agent", "Princesseuh")?;
    req.headers()
        .set("Authorization", &format!("Bearer {}", token))?;
    req.headers().set("X-GitHub-Api-Version", "2022-11-28")?;

    let response = Fetch::Request(req).send().await?;

    let status = response.status_code();
    Ok((200..300).contains(&status))
}

pub async fn post_to_github(
    token: &str,
    repo: &str,
    path: &str,
    content: &str,
    title: &str,
    skip_ci: bool,
) -> Result<String, Error> {
    let b64_content = general_purpose::STANDARD.encode(content);

    let skip_marker = if skip_ci { "[skip ci]" } else { "" };
    let body = GitHubRequest {
        message: format!(
            "content(catalogue): Add {} [skip cd] {}",
            title, skip_marker
        ),
        content: b64_content,
        committer: GitHubCommitter {
            name: "Princesseuh".to_string(),
            email: "3019731+Princesseuh@users.noreply.github.com".to_string(),
        },
    };

    let url = format!("https://api.github.com/repos/{}/contents/{}", repo, path);

    let body_json = serde_json::to_string(&body).map_err(|e| Error::from(e.to_string()))?;

    let opts = Request::new_with_init(
        &url,
        RequestInit::new()
            .with_method(Method::Put)
            .with_body(Some(JsValue::from(body_json))),
    )?;
    opts.headers()
        .set("Accept", "application/vnd.github+json")?;
    opts.headers().set("User-Agent", "Princesseuh")?;
    opts.headers()
        .set("Authorization", &format!("Bearer {}", token))?;
    opts.headers().set("X-GitHub-Api-Version", "2022-11-28")?;

    let mut response = Fetch::Request(opts).send().await?;

    let status = response.status_code();
    if !(200..300).contains(&status) {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(Error::from(format!("GitHub API error: {}", error_text)));
    }

    let response_json: serde_json::Value = response.json().await?;

    response_json["commit"]["html_url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| Error::from("No commit URL in response".to_string()))
}
