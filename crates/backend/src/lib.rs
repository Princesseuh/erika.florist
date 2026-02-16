use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::JsValue;
use worker::*;

#[derive(Debug, Deserialize)]
struct CommitForm {
    r#type: String,
    name: String,
    rating: String,
    date: String,
    #[serde(rename = "source-id")]
    source_id: String,
    #[serde(rename = "platform-select", default)]
    platform_select: String,
    comment: String,
    #[serde(rename = "skip-ci", default)]
    skip_ci: String,
}

#[derive(Serialize)]
struct GitHubRequest {
    message: String,
    content: String,
    committer: GitHubCommitter,
}

#[derive(Serialize)]
struct GitHubCommitter {
    name: String,
    email: String,
}

async fn check_auth(password: &str, env: &Env) -> Result<bool, Error> {
    let Ok(hashed_password) = env.secret("HASHED_PASSWORD") else {
        return Ok(false);
    };

    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hashed_input = format!("{:x}", hasher.finalize());

    Ok(hashed_input == hashed_password.to_string())
}

async fn search_tmdb(query: &str, type_: &str, env: &Env) -> Result<String, Error> {
    let tmdb_key = env
        .secret("TMDB_KEY")
        .map_err(|_| Error::from("TMDB_KEY not set"))?;

    let url = format!(
        "https://api.themoviedb.org/3/search/{}?query={}&api_key={}",
        type_, query, tmdb_key
    );

    let opts = Request::new_with_init(&url, RequestInit::new().with_method(Method::Get))?;

    let mut response = Fetch::Request(opts).send().await?;

    let status = response.status_code();
    if !(200..300).contains(&status) {
        return Err(Error::from(format!("TMDB returned status: {}", status)));
    }

    response
        .text()
        .await
        .map_err(|e| Error::from(e.to_string()))
}

async fn search_igdb(query: &str, env: &Env) -> Result<String, Error> {
    let igdb_key = env
        .secret("IGDB_KEY")
        .map_err(|_| Error::from("IGDB_KEY not set"))?;
    let igdb_client = env
        .secret("IGDB_CLIENT")
        .map_err(|_| Error::from("IGDB_CLIENT not set"))?;

    let token_url = format!(
        "https://id.twitch.tv/oauth2/token?client_id={}&client_secret={}&grant_type=client_credentials",
        igdb_client, igdb_key
    );

    let token_opts =
        Request::new_with_init(&token_url, RequestInit::new().with_method(Method::Post))?;

    let mut token_response = Fetch::Request(token_opts).send().await?;

    let token_data: serde_json::Value = token_response.json().await?;

    let access_token = token_data["access_token"]
        .as_str()
        .ok_or_else(|| Error::from("No access_token in IGDB response"))?;

    let search_url = "https://api.igdb.com/v4/games";
    let body = format!("fields name,cover.url,id; search \"{}\";", query);
    let search_opts = Request::new_with_init(
        search_url,
        RequestInit::new()
            .with_method(Method::Post)
            .with_body(Some(JsValue::from(body))),
    )?;
    search_opts.headers().set("Accept", "application/json")?;
    search_opts
        .headers()
        .set("Client-ID", &igdb_client.to_string())?;
    search_opts
        .headers()
        .set("Authorization", &format!("Bearer {}", access_token))?;

    let mut response = Fetch::Request(search_opts).send().await?;

    let status = response.status_code();
    if !(200..300).contains(&status) {
        return Err(Error::from(format!("IGDB returned status: {}", status)));
    }

    response
        .text()
        .await
        .map_err(|e| Error::from(e.to_string()))
}

async fn search_isbn(query: &str) -> Result<String, Error> {
    let url = format!(
        "https://openlibrary.org/search.json?title={}&fields=key,title,isbn,cover_i,editions,editions.isbn",
        query.replace(" ", "+")
    );

    let opts = Request::new_with_init(&url, RequestInit::new().with_method(Method::Get))?;

    let mut response = Fetch::Request(opts).send().await?;

    let status = response.status_code();
    if !(200..300).contains(&status) {
        return Err(Error::from(format!(
            "OpenLibrary returned status: {}",
            status
        )));
    }

    response
        .text()
        .await
        .map_err(|e| Error::from(e.to_string()))
}

async fn check_if_file_exists(
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

async fn post_to_github(
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

fn check_auth_cookie(headers: &Headers) -> bool {
    if let Ok(Some(cookie_str)) = headers.get("cookie") {
        cookie_str.contains("auth_token=")
    } else {
        false
    }
}

#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    // Auth endpoint - returns cookie
    if req.path() == "/auth" && req.method() == Method::Post {
        let form_data = req.form_data().await?;
        let password = form_data.get_field("password").unwrap_or_default();

        if check_auth(&password, &env).await? {
            let response = Response::from_json(&serde_json::json!({"success": true}))?;
            response.headers().set(
                "Set-Cookie",
                "auth_token=1; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000; Domain=erika.florist",
            )?;
            return Ok(response);
        } else {
            return Response::error("Unauthorized", 401);
        }
    }

    // Require auth for search and commit
    if !check_auth_cookie(req.headers()) {
        return Response::error("Unauthorized", 401);
    }

    if req.path() == "/search" && req.method() == Method::Get {
        let url = req.url().unwrap();
        let Some(query) = url.query() else {
            return Response::error("Missing query", 400);
        };

        let params: serde_json::Value = serde_json::from_str(&format!("{{\"{}\"}}", query))
            .map_err(|_| Error::from("Invalid query params"))?;

        let source = params["source"]
            .as_str()
            .ok_or_else(|| Error::from("Missing source param"))?;
        let query = params["query"]
            .as_str()
            .ok_or_else(|| Error::from("Missing query param"))?;

        let result = match source {
            "tmdb" => {
                let type_ = params["type"].as_str().unwrap_or("movie");
                search_tmdb(query, type_, &env).await
            }
            "igdb" => search_igdb(query, &env).await,
            "isbn" => search_isbn(query).await,
            _ => Err(Error::from("Invalid source")),
        };

        return match result {
            Ok(body) => Response::from_json(&body),
            Err(e) => Response::error(e.to_string(), 502),
        };
    }

    if req.path() == "/commit" && req.method() == Method::Post {
        let form: CommitForm = {
            let form_data = req.form_data().await?;

            CommitForm {
                r#type: form_data.get_field("type").unwrap_or_default(),
                name: form_data.get_field("name").unwrap_or_default(),
                rating: form_data.get_field("rating").unwrap_or_default(),
                date: form_data.get_field("date").unwrap_or_default(),
                source_id: form_data.get_field("source-id").unwrap_or_default(),
                platform_select: form_data.get_field("platform-select").unwrap_or_default(),
                comment: form_data.get_field("comment").unwrap_or_default(),
                skip_ci: form_data.get_field("skip-ci").unwrap_or_default(),
            }
        };

        let (source_key, path_type) = match form.r#type.as_str() {
            "movie" => ("tmdb", "movies"),
            "tv" => ("tmdb", "shows"),
            "game" => ("igdb", "games"),
            "book" => ("isbn", "books"),
            _ => return Response::error("Invalid type", 400),
        };

        let mut slug = form.name.to_lowercase().replace(' ', "-");
        let github_token = env
            .secret("GITHUB_KEY")
            .map_err(|_| Error::from("GITHUB_KEY not set"))?;
        let github_repo = env
            .secret("GITHUB_REPO")
            .map_err(|_| Error::from("GITHUB_REPO not set"))?;

        let file_exists = check_if_file_exists(
            &github_token.to_string(),
            &github_repo.to_string(),
            path_type,
            &slug,
        )
        .await?;

        if file_exists {
            let mut i = 1;
            loop {
                let test_slug = format!("{}-{}", slug, i);
                let file_exists = check_if_file_exists(
                    &github_token.to_string(),
                    &github_repo.to_string(),
                    path_type,
                    &test_slug,
                )
                .await?;

                if !file_exists {
                    slug = test_slug;
                    break;
                }
                i += 1;
            }
        }

        let platform_line = if !form.platform_select.is_empty() {
            format!("platform: \"{}\"\n", form.platform_select)
        } else {
            String::new()
        };

        let markdown_content = format!(
            "---\ntitle: \"{}\"\n{}rating: \"{}\"\nfinishedDate: {}\n{}: \"{}\"---\n\n{}\n",
            form.name,
            platform_line,
            form.rating,
            form.date,
            source_key,
            form.source_id,
            form.comment
        );

        let file_path = format!("{}/{}/{}.md", path_type, slug, slug);
        let commit_url = post_to_github(
            &github_token.to_string(),
            &github_repo.to_string(),
            &file_path,
            &markdown_content,
            &form.name,
            form.skip_ci == "skip-ci",
        )
        .await?;

        return Response::from_json(&serde_json::json!({
            "success": true,
            "commit_url": commit_url
        }));
    }

    Response::error("Not Found", 404)
}
