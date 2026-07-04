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
    /// When set, the batch's entries are also appended to this collection.
    #[serde(default)]
    pub collection: Option<String>,
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

/// Build the markdown for a brand-new entry. Planned items omit rating/finishedDate.
fn build_markdown(item: &BatchItem, source_key: &str) -> String {
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
    fm.push_str(&format!("{}: \"{}\"\n", source_key, item.source_id));
    fm.push_str("---\n\n");
    fm.push_str(&item.comment);
    if !item.comment.ends_with('\n') {
        fm.push('\n');
    }
    fm
}

/// GETs the raw text of an existing markdown file from the repo.
async fn fetch_existing_file(token: &str, repo: &str, path: &str) -> Result<String, Error> {
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
    // GitHub wraps the base64 payload in newlines.
    let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = general_purpose::STANDARD
        .decode(&cleaned)
        .map_err(|e| Error::from(format!("base64 decode failed: {}", e)))?;
    String::from_utf8(bytes).map_err(|e| Error::from(e.to_string()))
}

/// Promotes an existing planned entry to finished by editing its frontmatter
/// in place: drops `status`, inserts `rating`/`finishedDate` after `title`,
/// and replaces the body with the new comment. The source-id line
/// (`tmdb`/`igdb`/`isbn`) and any other frontmatter is preserved untouched.
fn promote_markdown(existing: &str, item: &BatchItem) -> Result<String, Error> {
    let rest = existing
        .strip_prefix("---\n")
        .ok_or_else(|| Error::from("Existing file has no frontmatter"))?;
    let end = rest
        .find("\n---")
        .ok_or_else(|| Error::from("Existing file frontmatter is not terminated"))?;
    let frontmatter = &rest[..end];

    let finished_date = if item.date.is_empty() {
        "N/A".to_string()
    } else {
        item.date.clone()
    };

    let mut out = String::from("---\n");
    let mut inserted_meta = false;
    for line in frontmatter.lines() {
        let key = line
            .split_once(':')
            .map(|(k, _)| k.trim())
            .unwrap_or_default();
        // Drop the planned marker and any stale rating/date lines.
        if key == "status" || key == "rating" || key == "finishedDate" {
            continue;
        }
        out.push_str(line);
        out.push('\n');
        if key == "title" && !inserted_meta {
            out.push_str(&format!("rating: \"{}\"\n", item.rating));
            out.push_str(&format!("finishedDate: {}\n", finished_date));
            inserted_meta = true;
        }
    }
    if !inserted_meta {
        out.push_str(&format!("rating: \"{}\"\n", item.rating));
        out.push_str(&format!("finishedDate: {}\n", finished_date));
    }
    out.push_str("---\n\n");
    out.push_str(&item.comment);
    if !item.comment.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
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
    let mut member_refs: Vec<String> = Vec::new();
    for item in &form.items {
        let (path_type, source_key) = type_to_paths(&item.r#type)?;

        let is_promote = item.slug.as_ref().is_some_and(|s| !s.is_empty());

        let (slug, content) = if is_promote {
            // Promote: edit the existing file's frontmatter in place. The
            // source-id and other frontmatter stay exactly as they were.
            let slug = item.slug.clone().unwrap();
            let path = format!("crates/website/content/{}/{}/{}.md", path_type, slug, slug);
            let existing = fetch_existing_file(token, repo, &path).await?;
            (slug, promote_markdown(&existing, item)?)
        } else {
            // New entry: the form provides the source-id (from the search result).
            if item.source_id.is_empty() {
                return Err(Error::from(format!(
                    "Missing source-id for new {} entry",
                    item.r#type
                )));
            }
            let base = slug::slugify(&item.name);
            if base.is_empty() {
                return Err(Error::from("Empty slug after slugify"));
            }
            let slug = resolve_new_slug(token, repo, path_type, &base).await?;
            (slug, build_markdown(item, source_key))
        };

        let path = format!("crates/website/content/{}/{}/{}.md", path_type, slug, slug);
        member_refs.push(format!("{}/{}", canonical_collection_type(&item.r#type)?, slug));
        resolved.push(ResolvedFile {
            path,
            content,
            display_title: item.name.clone(),
        });
    }

    // When submitted from a collection page, append the batch to that collection.
    if let Some(collection_slug) = form.collection.as_deref().filter(|s| !s.is_empty()) {
        let path = format!("crates/website/content/collections/{}.md", collection_slug);
        let existing = fetch_existing_file(token, repo, &path).await?;
        let updated = append_collection_members(&existing, &member_refs)?;
        if updated != existing {
            resolved.push(ResolvedFile {
                path,
                content: updated,
                display_title: collection_slug.to_string(),
            });
        }
    }

    let message = compose_batch_message(form, &resolved);

    commit_files(token, repo, &resolved, &message).await
}

/// Append `type/slug` refs to a collection's `members:` list, skipping any that
/// are already present. Everything else in the file is preserved verbatim.
fn append_collection_members(existing: &str, new_refs: &[String]) -> Result<String, Error> {
    let rest = existing
        .strip_prefix("---\n")
        .ok_or_else(|| Error::from("Collection file has no frontmatter"))?;
    let end = rest
        .find("\n---")
        .ok_or_else(|| Error::from("Collection frontmatter is not terminated"))?;
    let frontmatter = &rest[..end];
    let after = &rest[end..];

    let existing_refs: std::collections::HashSet<&str> = frontmatter
        .lines()
        .filter_map(|line| line.trim().strip_prefix("- "))
        .map(str::trim)
        .collect();
    let to_add: Vec<&String> = new_refs
        .iter()
        .filter(|r| !existing_refs.contains(r.as_str()))
        .collect();
    if to_add.is_empty() {
        return Ok(existing.to_string());
    }

    let mut lines: Vec<String> = frontmatter.lines().map(String::from).collect();
    let insert_after = lines
        .iter()
        .rposition(|line| line.starts_with("  ") && line.trim_start().starts_with("- "))
        .or_else(|| lines.iter().position(|line| line.trim_start().starts_with("members:")))
        .ok_or_else(|| Error::from("Collection has no members list"))?;

    let additions: Vec<String> = to_add.iter().map(|r| format!("  - {}", r)).collect();
    lines.splice(insert_after + 1..insert_after + 1, additions);

    Ok(format!("---\n{}{}", lines.join("\n"), after))
}

/// Compose the human-readable commit message for a catalogue batch.
fn compose_batch_message(form: &BatchForm, resolved: &[ResolvedFile]) -> String {
    // [skip cd] is added when the follow-up metadata-fetch workflow will create
    // a separate commit (the `[ci] update catalogue data` one) — that commit
    // triggers the deploy, so we skip the deploy here to avoid two deploys.
    // For batches with no new entries (only promotes), there is no follow-up,
    // so we must NOT skip cd or the change never deploys.
    let has_new_entries = form.items.iter().any(|i| i.slug.is_none());
    let skip_marker_ci = if form.skip_ci { " [skip ci]" } else { "" };
    let skip_marker_cd = if has_new_entries { " [skip cd]" } else { "" };
    if resolved.len() == 1 {
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
        let planned_count = form.items.iter().filter(|i| i.status == "planned").count();
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
    }
}

/// Commit a set of resolved files to `main` as a single commit and return the
/// commit's HTML URL. Shared by the catalogue batch and collection flows.
async fn commit_files(
    token: &str,
    repo: &str,
    files: &[ResolvedFile],
    message: &str,
) -> Result<String, Error> {
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
    let mut tree_entries: Vec<serde_json::Value> = Vec::with_capacity(files.len());
    for file in files {
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

    // 5. Create the commit.
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

    // 6. Move main to the new commit.
    let patch_body = serde_json::json!({ "sha": new_commit_sha });
    gh_patch(&ref_url, token, &patch_body).await?;

    Ok(html_url)
}

/// A collection created from the website: metadata plus a mix of existing
/// entries (referenced by slug) and brand-new ones (created on submit).
#[derive(Debug, Deserialize)]
pub struct CollectionForm {
    #[serde(rename = "form-password", alias = "form_password", default)]
    pub form_password: String,
    #[serde(rename = "skip-ci", alias = "skip_ci", default)]
    pub skip_ci: bool,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Each member reuses the BatchItem shape: an existing member carries a
    /// `slug` and no `source-id`; a new member carries a `source-id` (and gets
    /// a content file created).
    pub members: Vec<BatchItem>,
}

/// Canonical `type` segment used in a collection's `members` refs.
fn canonical_collection_type(item_type: &str) -> Result<&'static str, Error> {
    Ok(match item_type {
        "game" => "game",
        "movie" => "movie",
        "tv" | "show" => "show",
        "book" => "book",
        _ => return Err(Error::from(format!("Invalid type: {}", item_type))),
    })
}

/// Collections are single flat files (`content/collections/<slug>.md`), so they
/// need their own existence check rather than the nested-entry one.
async fn collection_file_exists(token: &str, repo: &str, slug: &str) -> Result<bool, Error> {
    let url = format!(
        "https://api.github.com/repos/{}/contents/crates/website/content/collections/{}.md",
        repo, slug
    );
    let req = Request::new_with_init(&url, RequestInit::new().with_method(Method::Get))?;
    gh_headers(&req, token)?;
    let response = Fetch::Request(req).send().await?;
    Ok((200..300).contains(&response.status_code()))
}

async fn resolve_new_collection_slug(token: &str, repo: &str, base: &str) -> Result<String, Error> {
    if !collection_file_exists(token, repo, base).await? {
        return Ok(base.to_string());
    }
    let mut i = 1;
    loop {
        let candidate = format!("{}-{}", base, i);
        if !collection_file_exists(token, repo, &candidate).await? {
            return Ok(candidate);
        }
        i += 1;
    }
}

/// Build the markdown for a new collection file.
fn build_collection_markdown(title: &str, description: &str, members: &[String]) -> String {
    let mut out = String::from("---\n");
    out.push_str(&format!("title: \"{}\"\n", title));
    out.push_str("members:\n");
    for member in members {
        out.push_str(&format!("  - {}\n", member));
    }
    out.push_str("---\n\n");
    out.push_str(description.trim_end());
    out.push('\n');
    out
}

pub async fn commit_collection(token: &str, repo: &str, form: &CollectionForm) -> Result<String, Error> {
    if form.title.trim().is_empty() {
        return Err(Error::from("Collection title is required"));
    }
    if form.members.is_empty() {
        return Err(Error::from("A collection needs at least one member"));
    }

    let mut files: Vec<ResolvedFile> = Vec::new();
    let mut member_refs: Vec<String> = Vec::with_capacity(form.members.len());
    let mut has_new = false;

    for member in &form.members {
        let (path_type, source_key) = type_to_paths(&member.r#type)?;
        let canonical = canonical_collection_type(&member.r#type)?;
        let is_existing = member.slug.as_ref().is_some_and(|s| !s.is_empty());

        let slug = if is_existing {
            member.slug.clone().unwrap()
        } else {
            if member.source_id.is_empty() {
                return Err(Error::from(format!(
                    "Missing source-id for new {} member",
                    member.r#type
                )));
            }
            let base = slug::slugify(&member.name);
            if base.is_empty() {
                return Err(Error::from("Empty slug after slugify"));
            }
            let slug = resolve_new_slug(token, repo, path_type, &base).await?;
            let path = format!("crates/website/content/{}/{}/{}.md", path_type, slug, slug);
            files.push(ResolvedFile {
                path,
                content: build_markdown(member, source_key),
                display_title: member.name.clone(),
            });
            has_new = true;
            slug
        };

        member_refs.push(format!("{}/{}", canonical, slug));
    }

    // The collection file itself.
    let base_slug = slug::slugify(&form.title);
    if base_slug.is_empty() {
        return Err(Error::from("Empty collection slug after slugify"));
    }
    let collection_slug = resolve_new_collection_slug(token, repo, &base_slug).await?;
    let path = format!("crates/website/content/collections/{}.md", collection_slug);
    files.push(ResolvedFile {
        path,
        content: build_collection_markdown(&form.title, &form.description, &member_refs),
        display_title: form.title.clone(),
    });

    let skip_marker_ci = if form.skip_ci { " [skip ci]" } else { "" };
    let skip_marker_cd = if has_new { " [skip cd]" } else { "" };
    let message = format!(
        "content(collections): Add {}{}{}",
        form.title, skip_marker_cd, skip_marker_ci
    );

    commit_files(token, repo, &files, &message).await
}
