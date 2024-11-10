use std::{collections::HashMap, env};

use aws_lambda_events::{
    apigw::{ApiGatewayProxyRequest, ApiGatewayProxyResponse},
    query_map::QueryMap,
};
use base64::{engine::general_purpose, Engine as _};
use cookie::{
    time::{Duration, OffsetDateTime},
    Cookie,
};
use http::{HeaderMap, Method};
use lambda_runtime::{service_fn, Error, LambdaEvent};
use log::LevelFilter;
use maud::{html, Markup, PreEscaped, DOCTYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use simple_logger::SimpleLogger;

#[derive(Debug, serde::Deserialize)]
struct QueryParams {
    query: String,
    r#type: String,
}

impl From<QueryMap> for QueryParams {
    fn from(query_map: QueryMap) -> Self {
        QueryParams {
            query: query_map.first("query").unwrap().to_string(),
            r#type: query_map.first("type").unwrap().to_string(),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    SimpleLogger::new()
        .with_utc_timestamps()
        .with_level(LevelFilter::Info)
        .init()
        .unwrap();
    let func = service_fn(handler);
    lambda_runtime::run(func).await?;
    Ok(())
}

pub(crate) async fn handler(
    event: LambdaEvent<ApiGatewayProxyRequest>,
) -> Result<ApiGatewayProxyResponse, Error> {
    let password = env::var("HASHED_PASSWORD").unwrap();

    if let Some(cookie) = event.payload.headers.get("cookie") {
        // This is not secure. Persistent cookies shouldn't be used for direct authentication.
        // Nonetheless, it's very unlikely for my own cookie to be stolen and the impact is quite minimal.
        let cookie = Cookie::parse(cookie.to_str().unwrap()).unwrap();

        if cookie.value() != password {
            return manage_login(event, password);
        }

        if event.payload.headers.contains_key("x-proxy-source") {
            return proxy_request(event).await;
        }

        match event.payload.http_method {
            Method::GET => Ok(ApiGatewayProxyResponse {
                status_code: 200,
                headers: {
                    let mut headers = HeaderMap::new();
                    headers.insert("Content-Type", "text/html".parse().unwrap());
                    headers
                },
                multi_value_headers: Default::default(),
                body: Some(form_layout().into_string().into()),
                is_base64_encoded: false,
            }),
            Method::POST => {
                let form_password = env::var("FORM_PASSWORD").unwrap();
                let data = form_urlencoded::parse(event.payload.body.unwrap().as_bytes())
                    .map(|(key, value)| (key.to_string(), value.to_string()))
                    .collect::<HashMap<String, String>>();

                if !data
                    .get("form_password")
                    .is_some_and(|f| f.to_lowercase() == form_password.to_lowercase())
                {
                    return Ok(ApiGatewayProxyResponse {
                        status_code: 401,
                        headers: Default::default(),
                        multi_value_headers: Default::default(),
                        body: Some(login_layout(Some("Invalid password")).into_string().into()),
                        is_base64_encoded: false,
                    });
                }

                let source_key = match data.get("type").unwrap().as_str() {
                    "movie" => "tmdb",
                    "tv" => "tmdb",
                    "game" => "igdb",
                    "book" => "isbn",
                    _ => "unknown",
                };

                let name = data.get("name").unwrap();
                let platform = format!(
                    "platform: \"{}\"\n",
                    data.get("platform-select").unwrap_or(&String::from(""))
                );

                let enable_date = data.get("no-date").unwrap_or(&String::from("")) == "on";

                let markdown_content = format!(
                    "---\ntitle: \"{name}\"\n{platform}rating: \"{rating}\"\nfinishedDate: {date}\n{source}: \"{sourceId}\"\n---\n\n{comment}\n",
                    comment = data.get("comment").unwrap(),
                    platform = if data.get("platform-select").unwrap_or(&String::from("")).is_empty() { "" } else { &platform },
                    rating = data.get("rating").unwrap(),
                    date = match enable_date {
                        true => data.get("date").unwrap(),
                        false => "N/A",
                    },
                    source = source_key,
                    sourceId = data.get("source-id").unwrap()
                );

                let path_type = match data.get("type").unwrap().as_str() {
                    "movie" => "movies",
                    "tv" => "shows",
                    "game" => "games",
                    "book" => "books",
                    _ => "unknown",
                };

                let mut slug = slug::slugify(name);

                // Check if the file already exists or not
                // If it does, we should append a number to the slug
                let client = reqwest::blocking::Client::new();
                let file_exists = check_if_file_exists(&client, path_type, slug.as_str());

                if file_exists {
                    let mut i = 1;
                    loop {
                        let file_exists = check_if_file_exists(
                            &client,
                            path_type,
                            format!("{slug}-{i}", slug = slug, i = i).as_str(),
                        );

                        if file_exists {
                            i += 1;
                        } else {
                            slug = format!("{slug}-{i}", slug = slug, i = i);
                            break;
                        }
                    }
                }

                let github_request = post_request(
                    &client,
                    format!("{path_type}/{slug}/{slug}.mdoc").as_str(),
                    &markdown_content,
                    name,
                    data.get("skip-ci").unwrap_or(&String::from("false")) == "skip-ci",
                    false, // NOTE: Change this to false when you're ready to deploy.
                );

                let commit_url = github_request
                    .get("commit")
                    .and_then(|commit| commit.get("html_url"))
                    .and_then(|url| url.as_str());

                match commit_url {
                    Some(commit_url) => Ok(ApiGatewayProxyResponse {
                        status_code: 200,
                        headers: {
                            let mut headers = HeaderMap::new();
                            headers.insert("Content-Type", "text/html".parse().unwrap());
                            headers
                        },
                        multi_value_headers: Default::default(),
                        body: Some(
                            layout(
                                html! {
                                  div id="success" {
                                    h1 { "Success!" }
                                    p {
                                      "Your content has been added to the catalogue. "
                                      a href=(commit_url) { "(See commit)" }
                                    }
                                    div id="success-buttons" {
                                      a href="/catalogue" { "Go back to the catalogue" }
                                      a href="/api/add" { "Add another" }
                                    }
                                  }
                                },
                                false,
                            )
                            .into_string()
                            .into(),
                        ),
                        is_base64_encoded: false,
                    }),
                    None => {
                        let request_as_string = serde_json::to_string(&github_request)
                            .unwrap_or("Could not parse request".to_string());

                        Ok(ApiGatewayProxyResponse {
                            status_code: 200,
                            headers: {
                                let mut headers = HeaderMap::new();
                                headers.insert("Content-Type", "text/html".parse().unwrap());
                                headers
                            },
                            multi_value_headers: Default::default(),
                            body: Some(
                                layout(
                                    html! {
                                      div id="success" {
                                        h1 { "Failed" }
                                        p { "An error occurred while adding your content:" }
                                        code { (request_as_string) }
                                        div id="success-buttons" {
                                          a href="/api/add" { "Try again" }
                                        }
                                      }
                                    },
                                    false,
                                )
                                .into_string()
                                .into(),
                            ),
                            is_base64_encoded: false,
                        })
                    }
                }
            }
            _ => Ok(ApiGatewayProxyResponse {
                status_code: 404,
                headers: Default::default(),
                multi_value_headers: Default::default(),
                body: Some("Not found".into()),
                is_base64_encoded: false,
            }),
        }
    } else {
        manage_login(event, password)
    }
}

fn check_if_file_exists(client: &reqwest::blocking::Client, path_type: &str, slug: &str) -> bool {
    let response = client
        .get(format!(
            "https://api.github.com/repos/Princesseuh/erika.florist/contents/content/{path_type}/{slug}/{slug}.mdoc",
            path_type = path_type,
            slug = slug
        ))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Princesseuh")
        .header(
            "Authorization",
            format!("Bearer {github_key}", github_key = env::var("GITHUB_KEY").unwrap()),
        )
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send();

    match response {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

fn manage_login(
    event: LambdaEvent<ApiGatewayProxyRequest>,
    password: String,
) -> Result<ApiGatewayProxyResponse, Error> {
    match event.payload.http_method {
        Method::GET => Ok(ApiGatewayProxyResponse {
            status_code: 401,
            headers: Default::default(),
            multi_value_headers: Default::default(),
            body: Some(login_layout(None).into_string().into()),
            is_base64_encoded: false,
        }),
        Method::POST => {
            let data = form_urlencoded::parse(event.payload.body.unwrap().as_bytes())
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect::<HashMap<String, String>>();

            if let Some(passed_password) = data.get("password") {
                let mut hasher = Sha256::new();
                hasher.update(passed_password);
                let hashed_password = format!("{:x}", hasher.finalize());

                if hashed_password == password {
                    let cookie = Cookie::build(("password", hashed_password))
                        .path("/.netlify/functions/add")
                        .secure(true)
                        .same_site(cookie::SameSite::Strict)
                        .http_only(true)
                        .expires(OffsetDateTime::now_utc().checked_add(Duration::days(30)))
                        .build();

                    Ok(ApiGatewayProxyResponse {
                        status_code: 200,
                        headers: {
                            let mut headers = HeaderMap::new();
                            headers.insert("Set-Cookie", cookie.to_string().parse().unwrap());
                            headers
                        },
                        multi_value_headers: Default::default(),
                        body: Some(
                            html! {(DOCTYPE) html { head { meta http-equiv="refresh" content="0" {}}}}
                                .into_string()
                                .into(),
                        ),
                        is_base64_encoded: false,
                    })
                } else {
                    Ok(ApiGatewayProxyResponse {
                        status_code: 401,
                        headers: Default::default(),
                        multi_value_headers: Default::default(),
                        body: Some(login_layout(Some("Invalid password")).into_string().into()),
                        is_base64_encoded: false,
                    })
                }
            } else {
                Ok(ApiGatewayProxyResponse {
                    status_code: 401,
                    headers: Default::default(),
                    multi_value_headers: Default::default(),
                    body: Some(login_layout(Some("Invalid form")).into_string().into()),
                    is_base64_encoded: false,
                })
            }
        }
        _ => Ok(ApiGatewayProxyResponse {
            status_code: 401,
            headers: Default::default(),
            multi_value_headers: Default::default(),
            body: Some(login_layout(Some("Invalid request")).into_string().into()),
            is_base64_encoded: false,
        }),
    }
}

async fn proxy_request(
    event: LambdaEvent<ApiGatewayProxyRequest>,
) -> Result<ApiGatewayProxyResponse, Error> {
    let source = event
        .payload
        .headers
        .get("x-proxy-source")
        .unwrap()
        .to_str()
        .unwrap();

    let client = reqwest::Client::new();
    let query_params = QueryParams::from(event.payload.query_string_parameters);

    println!("{:?}", query_params);

    match source {
        "tmdb" => {
            let tmdb_key = env::var("TMDB_KEY").unwrap();

            let response = client
                .get(format!(
                    "https://api.themoviedb.org/3/search/{0}?query={1}&api_key={tmdb_key}",
                    query_params.r#type, query_params.query,
                ))
                .send()
                .await?;

            let response_body = response.text().await.unwrap();

            Ok(ApiGatewayProxyResponse {
                status_code: 200,
                headers: {
                    let mut headers = HeaderMap::new();
                    headers.insert("Content-Type", "application/json".parse().unwrap());
                    headers
                },
                multi_value_headers: Default::default(),
                body: Some(response_body.into()),
                is_base64_encoded: false,
            })
        }
        "igdb" => {
            let igdb_key = env::var("IGDB_KEY").unwrap();
            let igdb_client = env::var("IGDB_CLIENT").unwrap();
            let igdb_access_request = client.post(format!("https://id.twitch.tv/oauth2/token?client_id={igdb_client}&client_secret={igdb_key}&grant_type=client_credentials")).send().await?.text().await.unwrap();
            let parsed_request: HashMap<String, Value> =
                serde_json::from_str(igdb_access_request.as_str()).unwrap();
            let igdb_access_token = parsed_request
                .get("access_token")
                .unwrap()
                .as_str()
                .unwrap();

            let response = client
                .post("https://api.igdb.com/v4/games")
                .header("Accept", "application/json")
                .header("Client-ID", igdb_client)
                .header("Authorization", format!("Bearer {igdb_access_token}"))
                .body(format!(
                    "fields name,cover.url,id; search \"{query}\";",
                    query = query_params.query
                ))
                .send()
                .await?;

            let response_body = response.text().await.unwrap();

            Ok(ApiGatewayProxyResponse {
                status_code: 200,
                headers: {
                    let mut headers = HeaderMap::new();
                    headers.insert("Content-Type", "application/json".parse().unwrap());
                    headers
                },
                multi_value_headers: Default::default(),
                body: Some(response_body.into()),
                is_base64_encoded: false,
            })
        }
        "isbn" => {
            let response = client
                .get(format!(
                    "https://openlibrary.org/search.json?title={query}&fields=key,title,isbn,cover_i,editions,editions.isbn",
                    query = query_params.query.replace(" ", "+")
                ))
                .send().await?;

            let response_body = response.text().await.unwrap();

            Ok(ApiGatewayProxyResponse {
                status_code: 200,
                headers: {
                    let mut headers = HeaderMap::new();
                    headers.insert("Content-Type", "application/json".parse().unwrap());
                    headers
                },
                multi_value_headers: Default::default(),
                body: Some(response_body.into()),
                is_base64_encoded: false,
            })
        }
        _ => Ok(ApiGatewayProxyResponse {
            status_code: 400,
            headers: Default::default(),
            multi_value_headers: Default::default(),
            body: Some("Invalid source".into()),
            is_base64_encoded: false,
        }),
    }
}

fn layout(content: Markup, include_script: bool) -> Markup {
    html! {
      (DOCTYPE)
      html {
        head {
            meta charset="utf-8";
            title { "Add to catalogue" }
            meta name="viewport" content="width=device-width, initial-scale=1";
            style { (PreEscaped(include_str!("./web/style.css").trim())) }
            @if include_script {
              script type="module" {
                (PreEscaped(include_str!("./web/script.js").trim()))
              }
            }
        }
        body {
          (content)
        }
      }
    }
}

fn login_layout(error_message: Option<&str>) -> Markup {
    layout(
        html! {
            @if error_message.is_some() {
                p { (error_message.unwrap()) }
            }
            form method="post" {
                input type="password" name="password" placeholder="Password";
                input type="submit" value="Submit";
            }
        },
        false,
    )
}

fn form_layout() -> Markup {
    let ratings = ["Hated", "Disliked", "Okay", "Liked", "Loved", "Masterpiece"];
    let ratings_emoji = ["🙁", "😕", "😐", "🙂", "😍", "❤️"];

    layout(
        html! {
            form method="post" {
                div id="type-name" {
                  select required name="type" id="type" {
                      option value="movie" { "Movie" }
                      option value="tv" { "Show" }
                      option value="game" { "Game" }
                      option value="book" { "Book" }
                  }

                  input type="text" id="name" name="name" list="name-list" placeholder="Name" required;
                  span .loader {}
                  datalist id="name-list" {}
                }
                div id="rating-list" {
                  @for (i, rating) in ratings.iter().enumerate() {
                      input type="radio" required name="rating" id=(format!("rating{}", i)) value=(rating.to_lowercase());
                      label for=(format!("rating{}", i)) { (ratings_emoji[i]) }
                  }
                }
                div id="date-comment" {
                  div id="date-source" {
                    div {
                      div id="date-header" {
                        label for="date" { "Date" }
                        input type="checkbox" id="no-date" name="no-date" checked;
                      }
                      input type="date" name="date" id="date" required value=(chrono::Local::now().format("%Y-%m-%d"));
                    }
                    div {
                      label for="source-id" { "Source ID" }
                      input type="text" id="source-id" name="source-id" placeholder="Source ID" required;
                    }
                    div id="platform" style="display: none;" {
                      label for="platform-select" { "Platform" }
                      select name="platform-select" id="platform-select" {}
                    }
                  }
                  div id="comment-textarea" {
                    label for="comment" { "Comment" }
                    textarea name="comment" id="comment" rows="5" cols="40" placeholder="Thoughts" {""}
                  }
                }
                div id="confirm-submit" {
                  input type="password" name="form_password" placeholder="Confirmation" required;
                  input type="submit" value="Submit" id="submit";
                }
                div id="skip-ci-div" {
                  label for="skip-ci" style="display: inline;" {
                    abbr title="If this is enabled, the commit created by this entry won't cause a deploy. Use when adding multiple entries." { "Skip CI?" }
                  }
                  input type="checkbox" id="skip-ci" name="skip-ci" value="skip-ci";
                }
            }
        },
        true,
    )
}

#[derive(Serialize, Deserialize)]
struct GitHubRequest {
    message: String,
    content: String,
    commiter: GitHubCommitter,
}

#[derive(Serialize, Deserialize)]
struct GitHubCommitter {
    name: String,
    email: String,
}

fn post_request(
    client: &reqwest::blocking::Client,
    path: &str,
    body: &str,
    clear_name: &str,
    skip_ci: bool,
    dry: bool,
) -> HashMap<String, Value> {
    let github_key = env::var("GITHUB_KEY").unwrap();

    let b64 = general_purpose::STANDARD.encode(body);
    let skip_ci_marker = if skip_ci { "[skip ci]" } else { "[auto]" };

    let body = GitHubRequest {
        message: format!("content(catalogue): Add {clear_name} {skip_ci_marker}"),
        content: b64,
        commiter: GitHubCommitter {
            name: "Princesseuh".to_string(),
            email: "princssdev@gmail.com".to_string(),
        },
    };

    if dry {
        return serde_json::from_str(
            r#"
            {
                "commit": {
                    "html_url": "https://erika.florist"
                }
            }
            "#,
        )
        .unwrap();
    }

    let req = client
        .put(format!(
            "https://api.github.com/repos/Princesseuh/erika.florist/contents/content/{path}"
        ))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Princesseuh")
        .header(
            "Authorization",
            format!("Bearer {github_key}", github_key = github_key.as_str()),
        )
        .header("X-GitHub-Api-Version", "2022-11-28")
        .body(serde_json::to_string(&body).unwrap()) // Could we use Reqwest's json method instead?
        .send();

    serde_json::from_str(req.unwrap().text().unwrap().as_str()).unwrap()
}
