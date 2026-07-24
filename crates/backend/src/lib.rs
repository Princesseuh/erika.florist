use sha2::{Digest, Sha256};
use worker::*;

mod search;
use search::{search_igdb, search_isbn, search_tmdb};

mod github;
use github::{batch_commit, commit_collection, BatchForm, CollectionForm};

mod scratchmap;

fn check_auth_cookie(headers: &Headers, env: &Env) -> bool {
    if let Ok(Some(cookie_str)) = headers.get("cookie") {
        if let Some(token) = cookie_str.split("auth_token=").nth(1) {
            let token = token.split(';').next().unwrap_or(token);
            let Ok(hashed_password) = env.secret("HASHED_PASSWORD") else {
                return false;
            };
            return token == hashed_password.to_string();
        }
    }
    false
}

fn add_cors_headers(response: &mut Response, origin: Option<String>, env: &Env) {
    let allowed_origins = env
        .var("ALLOWED_ORIGINS")
        .map(|v| v.to_string())
        .unwrap_or_default();

    let origin_str = match origin {
        Some(ref o)
            if allowed_origins.split(',').any(|allowed| {
                if allowed == "*" {
                    true
                } else if allowed.contains("localhost") || allowed.contains("127.0.0.1") {
                    o.contains("localhost") || o.contains("127.0.0.1")
                } else {
                    o.contains(allowed)
                }
            }) =>
        {
            o.as_str()
        }
        _ => return,
    };
    let _ = response
        .headers()
        .set("Access-Control-Allow-Origin", origin_str);
    let _ = response
        .headers()
        .set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    let _ = response
        .headers()
        .set("Access-Control-Allow-Headers", "Content-Type");
    let _ = response
        .headers()
        .set("Access-Control-Allow-Credentials", "true");
}

async fn handle(req: &mut Request, env: &Env) -> Result<Response> {
    // Handle CORS preflight
    if req.method() == Method::Options {
        return Response::empty();
    }

    // Auth endpoint - returns cookie
    if req.path() == "/auth" && req.method() == Method::Post {
        let form_data = req.form_data().await?;
        let password = form_data.get_field("password").unwrap_or_default();

        let Ok(hashed_password) = env.secret("HASHED_PASSWORD") else {
            return Response::error("Server error", 500);
        };

        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let hashed_input: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();

        if hashed_input == hashed_password.to_string() {
            let response = Response::from_json(&serde_json::json!({"success": true}))?;
            let allowed_origins = env
                .var("ALLOWED_ORIGINS")
                .map(|v| v.to_string())
                .unwrap_or_default();
            let is_dev =
                allowed_origins.contains("localhost") || allowed_origins.contains("127.0.0.1");

            let (auth_cookie, logged_in_cookie) = if is_dev {
                (
                    format!(
                        "auth_token={}; Path=/; HttpOnly; Max-Age=2592000",
                        hashed_input
                    ),
                    "logged_in=true; Path=/; Max-Age=2592000".to_string(),
                )
            } else {
                (
                    format!("auth_token={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000; Domain=erika.florist", hashed_input),
                    "logged_in=true; Path=/; SameSite=Strict; Max-Age=2592000; Domain=erika.florist".to_string(),
                )
            };

            response.headers().append("Set-Cookie", &auth_cookie)?;
            response.headers().append("Set-Cookie", &logged_in_cookie)?;
            return Ok(response);
        } else {
            return Response::error("Unauthorized", 401);
        }
    }

    // Check auth status endpoint (validates cookie value)
    if req.path() == "/auth" && req.method() == Method::Get {
        let authenticated = check_auth_cookie(req.headers(), env);
        let response = Response::from_json(&serde_json::json!({ "authenticated": authenticated }))?;
        if !authenticated {
            let allowed_origins = env
                .var("ALLOWED_ORIGINS")
                .map(|v| v.to_string())
                .unwrap_or_default();
            let is_dev =
                allowed_origins.contains("localhost") || allowed_origins.contains("127.0.0.1");
            let (clear_auth, clear_logged_in) = if is_dev {
                (
                    "auth_token=; Path=/; HttpOnly; Max-Age=0".to_string(),
                    "logged_in=; Path=/; Max-Age=0".to_string(),
                )
            } else {
                (
                    "auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Domain=erika.florist".to_string(),
                    "logged_in=; Path=/; SameSite=Strict; Max-Age=0; Domain=erika.florist".to_string(),
                )
            };
            response.headers().append("Set-Cookie", &clear_auth)?;
            response.headers().append("Set-Cookie", &clear_logged_in)?;
        }
        return Ok(response);
    }

    // Scratch map: phone ingest + CI read. Token-authed (not cookie), so handled
    // before the cookie gate below.
    if req.path() == "/scratchmap" && req.method() == Method::Post {
        return scratchmap::ingest_location(req, env).await;
    }
    if req.path() == "/scratchmap/cells" && req.method() == Method::Get {
        return scratchmap::list_cells(req, env).await;
    }

    // Require auth for search, commit, and the scratch-map live view
    if !check_auth_cookie(req.headers(), env) {
        return Response::error("Unauthorized", 401);
    }

    // Scratch-map live view: cells + last hex for the logged-in map. Cookie-gated by
    // the check above, so the browser never holds the token OwnTracks writes with.
    if req.path() == "/scratchmap/live" && req.method() == Method::Get {
        return scratchmap::live_cells(env).await;
    }

    if req.path() == "/search" && req.method() == Method::Get {
        let url = req.url().unwrap();
        let Some(query_string) = url.query() else {
            return Response::error("Missing query", 400);
        };

        let mut source = None;
        let mut query = None;

        for pair in query_string.split('&') {
            let parts: Vec<&str> = pair.splitn(2, '=').collect();
            if parts.len() == 2 {
                match parts[0] {
                    "source" => source = Some(parts[1].to_string()),
                    "query" => {
                        query = Some(
                            urlencoding::decode(parts[1])
                                .map(|s| s.to_string())
                                .unwrap_or_else(|_| parts[1].to_string()),
                        )
                    }
                    _ => {}
                }
            }
        }

        let source = match source {
            Some(s) => s,
            None => return Response::error("Missing source param", 400),
        };
        let query = match query {
            Some(q) => q,
            None => return Response::error("Missing query param", 400),
        };

        let mut type_param = "movie".to_string();
        for pair in query_string.split('&') {
            let parts: Vec<&str> = pair.splitn(2, '=').collect();
            if parts.len() == 2 && parts[0] == "type" {
                type_param = parts[1].to_string();
            }
        }

        let result = match source.as_str() {
            "tmdb" => search_tmdb(&query, &type_param, env).await,
            "igdb" => search_igdb(&query, env).await,
            "isbn" => search_isbn(&query).await,
            _ => Err(Error::from("Invalid source")),
        };

        return match result {
            Ok(body) => {
                let bytes = body.into_bytes();
                let response = Response::from_bytes(bytes)?;
                response.headers().set("Content-Type", "application/json")?;
                Ok(response)
            }
            Err(e) => Response::error(e.to_string(), 502),
        };
    }

    if req.path() == "/commit-batch" && req.method() == Method::Post {
        let body_text = req.text().await?;
        let form: BatchForm = match serde_json::from_str(&body_text) {
            Ok(f) => f,
            Err(e) => return Response::error(format!("Invalid request body: {}", e), 400),
        };

        let Ok(form_password) = env.secret("FORM_PASSWORD") else {
            return Response::error("Server error", 500);
        };
        let mut hasher = Sha256::new();
        hasher.update(form.form_password.as_bytes());
        let hashed_input: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
        if hashed_input != form_password.to_string() {
            return Response::error("Unauthorized", 401);
        }

        if form.items.is_empty() {
            return Response::error("No items to commit", 400);
        }

        let github_token = env
            .secret("GITHUB_KEY")
            .map_err(|_| Error::from("GITHUB_KEY not set"))?;
        let github_repo = env
            .secret("GITHUB_REPO")
            .map_err(|_| Error::from("GITHUB_REPO not set"))?;

        let commit_url =
            batch_commit(&github_token.to_string(), &github_repo.to_string(), &form).await?;

        return Response::from_json(&serde_json::json!({
            "success": true,
            "commit_url": commit_url,
            "count": form.items.len(),
        }));
    }

    if req.path() == "/commit-collection" && req.method() == Method::Post {
        let body_text = req.text().await?;
        let form: CollectionForm = match serde_json::from_str(&body_text) {
            Ok(f) => f,
            Err(e) => return Response::error(format!("Invalid request body: {}", e), 400),
        };

        let Ok(form_password) = env.secret("FORM_PASSWORD") else {
            return Response::error("Server error", 500);
        };
        let mut hasher = Sha256::new();
        hasher.update(form.form_password.as_bytes());
        let hashed_input: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
        if hashed_input != form_password.to_string() {
            return Response::error("Unauthorized", 401);
        }

        let github_token = env
            .secret("GITHUB_KEY")
            .map_err(|_| Error::from("GITHUB_KEY not set"))?;
        let github_repo = env
            .secret("GITHUB_REPO")
            .map_err(|_| Error::from("GITHUB_REPO not set"))?;

        let commit_url =
            commit_collection(&github_token.to_string(), &github_repo.to_string(), &form).await?;

        return Response::from_json(&serde_json::json!({
            "success": true,
            "commit_url": commit_url,
        }));
    }

    Response::error("Not Found", 404)
}

#[event(fetch)]
async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let origin = req.headers().get("origin").ok().flatten();
    let mut response = match handle(&mut req, &env).await {
        Ok(response) => response,
        Err(e) => Response::error(e.to_string(), 500)?,
    };
    add_cors_headers(&mut response, origin, &env);
    Ok(response)
}
