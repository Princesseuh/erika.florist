use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;
use worker::*;

#[derive(Debug, Deserialize, Default)]
pub struct BatchItem {
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub rating: String,
    #[serde(default)]
    pub date: String,
    #[serde(rename = "source-id", alias = "source_id", default)]
    pub source_id: String,
    #[serde(default)]
    pub comment: String,
    #[serde(default = "default_status")]
    pub status: String,
    /// When provided, this slug already exists on main and the commit
    /// updates it in place (used for promoting planned → finished).
    #[serde(default)]
    pub slug: Option<String>,
}

fn default_status() -> String {
    "finished".to_string()
}

#[derive(Debug, Deserialize)]
pub struct BatchForm {
    #[serde(rename = "form-password", alias = "form_password", default)]
    pub form_password: String,
    #[serde(rename = "skip-ci", alias = "skip_ci", default)]
    pub skip_ci: bool,
    pub items: Vec<BatchItem>,
}

#[derive(Serialize)]
struct GitHubCommitter {
    name: String,
    email: String,
}

fn committer() -> GitHubCommitter {
    GitHubCommitter {
        name: "Princesseuh".to_string(),
        email: "3019731+Princesseuh@users.noreply.github.com".to_string(),
    }
}

fn gh_headers(req: &Request, token: &str) -> Result<()> {
    let h = req.headers();
    h.set("Accept", "application/vnd.github+json")?;
    h.set("User-Agent", "Princesseuh")?;
    h.set("Authorization", &format!("Bearer {}", token))?;
    h.set("X-GitHub-Api-Version", "2022-11-28")?;
    Ok(())
}

async fn gh_get(url: &str, token: &str) -> Result<serde_json::Value> {
    let req = Request::new_with_init(url, RequestInit::new().with_method(Method::Get))?;
    gh_headers(&req, token)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    if !(200..300).contains(&status) {
        let text = resp.text().await.unwrap_or_default();
        return Err(Error::from(format!(
            "GitHub GET {} → {}: {}",
            url, status, text
        )));
    }
    resp.json().await
}

async fn gh_post(url: &str, token: &str, body: &serde_json::Value) -> Result<serde_json::Value> {
    let body_json = serde_json::to_string(body).map_err(|e| Error::from(e.to_string()))?;
    let req = Request::new_with_init(
        url,
        RequestInit::new()
            .with_method(Method::Post)
            .with_body(Some(JsValue::from(body_json))),
    )?;
    gh_headers(&req, token)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    if !(200..300).contains(&status) {
        let text = resp.text().await.unwrap_or_default();
        return Err(Error::from(format!(
            "GitHub POST {} → {}: {}",
            url, status, text
        )));
    }
    resp.json().await
}

async fn gh_patch(url: &str, token: &str, body: &serde_json::Value) -> Result<serde_json::Value> {
    let body_json = serde_json::to_string(body).map_err(|e| Error::from(e.to_string()))?;
    let req = Request::new_with_init(
        url,
        RequestInit::new()
            .with_method(Method::Patch)
            .with_body(Some(JsValue::from(body_json))),
    )?;
    gh_headers(&req, token)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    if !(200..300).contains(&status) {
        let text = resp.text().await.unwrap_or_default();
        return Err(Error::from(format!(
            "GitHub PATCH {} → {}: {}",
            url, status, text
        )));
    }
    resp.json().await
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
    gh_headers(&req, token)?;

    let response = Fetch::Request(req).send().await?;
    let status = response.status_code();
    Ok((200..300).contains(&status))
}

/// Resolve the (path_type, source_key) pair from the item's type field.
fn type_to_paths(item_type: &str) -> Result<(&'static str, &'static str), Error> {
    Ok(match item_type {
        "movie" => ("movies", "tmdb"),
        "tv" => ("shows", "tmdb"),
        "game" => ("games", "igdb"),
        "book" => ("books", "isbn"),
        _ => return Err(Error::from(format!("Invalid type: {}", item_type))),
    })
}

/// Build the markdown frontmatter + body. Planned items omit rating/finishedDate.
fn build_markdown(item: &BatchItem, source_key: &str, source_id: &str) -> String {
    let planned = item.status == "planned";

    let mut fm = String::new();
    fm.push_str("---\n");
    fm.push_str(&format!("title: \"{}\"\n", item.name));
    if planned {
        fm.push_str("status: \"planned\"\n");
    } else {
        fm.push_str(&format!("rating: \"{}\"\n", item.rating));
        let finished_date = if item.date.is_empty() {
            "N/A".to_string()
        } else {
            item.date.clone()
        };
        fm.push_str(&format!("finishedDate: {}\n", finished_date));
    }
    fm.push_str(&format!("{}: \"{}\"\n", source_key, source_id));
    fm.push_str("---\n\n");
    fm.push_str(&item.comment);
    if !item.comment.ends_with('\n') {
        fm.push('\n');
    }
    fm
}

/// GETs the existing markdown file and returns the value of a frontmatter field
/// (e.g. `tmdb`, `igdb`, `isbn`). Used when promoting a planned item — the
/// existing file already has the source id, so the frontend doesn't need to
/// know it.
async fn fetch_existing_source_id(
    token: &str,
    repo: &str,
    path: &str,
    source_key: &str,
) -> Result<String, Error> {
    let url = format!("https://api.github.com/repos/{}/contents/{}", repo, path);
    let req = Request::new_with_init(&url, RequestInit::new().with_method(Method::Get))?;
    gh_headers(&req, token)?;
    let mut resp = Fetch::Request(req).send().await?;
    let status = resp.status_code();
    if !(200..300).contains(&status) {
        let text = resp.text().await.unwrap_or_default();
        return Err(Error::from(format!(
            "GitHub GET {} → {}: {}",
            url, status, text
        )));
    }
    let json: serde_json::Value = resp.json().await?;
    let encoded = json["content"]
        .as_str()
        .ok_or_else(|| Error::from("Missing file content"))?;
    // GitHub wraps the base64 content in newlines.
    let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = general_purpose::STANDARD
        .decode(&cleaned)
        .map_err(|e| Error::from(format!("base64 decode failed: {}", e)))?;
    let text = String::from_utf8(bytes).map_err(|e| Error::from(e.to_string()))?;
    extract_frontmatter_field(&text, source_key)
        .ok_or_else(|| Error::from(format!("Missing `{}` in existing frontmatter", source_key)))
}

/// Parses the frontmatter block (between `---` markers) and returns the
/// trimmed/unquoted value for the given key. Returns None if not found.
fn extract_frontmatter_field(content: &str, key: &str) -> Option<String> {
    let mut in_frontmatter = false;
    for line in content.lines() {
        let trimmed = line.trim_end();
        if trimmed == "---" {
            if in_frontmatter {
                return None;
            }
            in_frontmatter = true;
            continue;
        }
        if !in_frontmatter {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.trim() == key {
                let value = v.trim().trim_matches('"');
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Resolve a unique slug for a new entry by appending -1, -2, ... if needed.
async fn resolve_new_slug(
    token: &str,
    repo: &str,
    path_type: &str,
    base_slug: &str,
) -> Result<String, Error> {
    if !check_if_file_exists(token, repo, path_type, base_slug).await? {
        return Ok(base_slug.to_string());
    }
    let mut i = 1;
    loop {
        let candidate = format!("{}-{}", base_slug, i);
        if !check_if_file_exists(token, repo, path_type, &candidate).await? {
            return Ok(candidate);
        }
        i += 1;
    }
}

#[derive(Debug)]
struct ResolvedFile {
    path: String,
    content: String,
    display_title: String,
}

pub async fn batch_commit(
    token: &str,
    repo: &str,
    form: &BatchForm,
) -> Result<String, Error> {
    if form.items.is_empty() {
        return Err(Error::from("No items to commit"));
    }

    // Resolve each item to a file path + markdown content.
    let mut resolved: Vec<ResolvedFile> = Vec::with_capacity(form.items.len());
    for item in &form.items {
        let (path_type, source_key) = type_to_paths(&item.r#type)?;

        let is_promote = item.slug.as_ref().is_some_and(|s| !s.is_empty());

        let slug = if is_promote {
            item.slug.clone().unwrap()
        } else {
            let base = slug::slugify(&item.name);
            if base.is_empty() {
                return Err(Error::from("Empty slug after slugify"));
            }
            resolve_new_slug(token, repo, path_type, &base).await?
        };

        let path = format!("crates/website/content/{}/{}/{}.md", path_type, slug, slug);

        // For promotions, the existing file holds the source id (igdb/tmdb/isbn);
        // the frontend doesn't carry it. For new adds, the form provides it.
        let source_id = if is_promote {
            fetch_existing_source_id(token, repo, &path, source_key).await?
        } else {
            if item.source_id.is_empty() {
                return Err(Error::from(format!(
                    "Missing source-id for new {} entry",
                    item.r#type
                )));
            }
            item.source_id.clone()
        };

        let markdown = build_markdown(item, source_key, &source_id);
        resolved.push(ResolvedFile {
            path,
            content: markdown,
            display_title: item.name.clone(),
        });
    }

    // 1. Get current HEAD of main.
    let ref_url = format!("https://api.github.com/repos/{}/git/refs/heads/main", repo);
    let ref_json = gh_get(&ref_url, token).await?;
    let head_sha = ref_json["object"]["sha"]
        .as_str()
        .ok_or_else(|| Error::from("Missing ref sha"))?
        .to_string();

    // 2. Get the tree sha from the parent commit.
    let commit_url = format!("https://api.github.com/repos/{}/git/commits/{}", repo, head_sha);
    let commit_json = gh_get(&commit_url, token).await?;
    let base_tree_sha = commit_json["tree"]["sha"]
        .as_str()
        .ok_or_else(|| Error::from("Missing base tree sha"))?
        .to_string();

    // 3. Create a blob for each file.
    let blobs_url = format!("https://api.github.com/repos/{}/git/blobs", repo);
    let mut tree_entries: Vec<serde_json::Value> = Vec::with_capacity(resolved.len());
    for file in &resolved {
        let blob_body = serde_json::json!({
            "content": general_purpose::STANDARD.encode(&file.content),
            "encoding": "base64",
        });
        let blob_json = gh_post(&blobs_url, token, &blob_body).await?;
        let blob_sha = blob_json["sha"]
            .as_str()
            .ok_or_else(|| Error::from("Missing blob sha"))?
            .to_string();
        tree_entries.push(serde_json::json!({
            "path": file.path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        }));
    }

    // 4. Create the new tree.
    let tree_url = format!("https://api.github.com/repos/{}/git/trees", repo);
    let tree_body = serde_json::json!({
        "base_tree": base_tree_sha,
        "tree": tree_entries,
    });
    let tree_json = gh_post(&tree_url, token, &tree_body).await?;
    let new_tree_sha = tree_json["sha"]
        .as_str()
        .ok_or_else(|| Error::from("Missing new tree sha"))?
        .to_string();

    // 5. Compose the commit message.
    // [skip cd] is added when the follow-up metadata-fetch workflow will create
    // a separate commit (the `[ci] update catalogue data` one) — that commit
    // triggers the deploy, so we skip the deploy here to avoid two deploys.
    // For batches with no new entries (only promotes), there is no follow-up,
    // so we must NOT skip cd or the change never deploys.
    let has_new_entries = form.items.iter().any(|i| i.slug.is_none());
    let skip_marker_ci = if form.skip_ci { " [skip ci]" } else { "" };
    let skip_marker_cd = if has_new_entries { " [skip cd]" } else { "" };
    let message = if resolved.len() == 1 {
        let only = &resolved[0];
        let planned = form.items[0].status == "planned";
        let is_promote = form.items[0].slug.is_some();
        let verb = if is_promote {
            "Promote"
        } else if planned {
            "Plan"
        } else {
            "Add"
        };
        format!(
            "content(catalogue): {} {}{}{}",
            verb, only.display_title, skip_marker_cd, skip_marker_ci
        )
    } else {
        let planned_count = form
            .items
            .iter()
            .filter(|i| i.status == "planned")
            .count();
        let promote_count = form.items.iter().filter(|i| i.slug.is_some()).count();
        let finished_count = resolved.len() - planned_count - promote_count;
        let mut parts: Vec<String> = Vec::new();
        if finished_count > 0 {
            parts.push(format!("{} finished", finished_count));
        }
        if planned_count > 0 {
            parts.push(format!("{} planned", planned_count));
        }
        if promote_count > 0 {
            parts.push(format!("{} promoted", promote_count));
        }
        let summary = parts.join(", ");
        format!(
            "content(catalogue): Batch {} entries ({}){}{}",
            resolved.len(),
            summary,
            skip_marker_cd,
            skip_marker_ci
        )
    };

    // 6. Create the commit.
    let commits_url = format!("https://api.github.com/repos/{}/git/commits", repo);
    let committer = committer();
    let commit_body = serde_json::json!({
        "message": message,
        "tree": new_tree_sha,
        "parents": [head_sha],
        "author": { "name": committer.name, "email": committer.email },
        "committer": { "name": committer.name, "email": committer.email },
    });
    let new_commit_json = gh_post(&commits_url, token, &commit_body).await?;
    let new_commit_sha = new_commit_json["sha"]
        .as_str()
        .ok_or_else(|| Error::from("Missing new commit sha"))?
        .to_string();
    let html_url = new_commit_json["html_url"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_default();

    // 7. Move main to the new commit.
    let patch_body = serde_json::json!({ "sha": new_commit_sha });
    gh_patch(&ref_url, token, &patch_body).await?;

    Ok(html_url)
}
