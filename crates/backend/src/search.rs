use wasm_bindgen::JsValue;
use worker::*;

pub async fn search_tmdb(query: &str, type_: &str, env: &Env) -> Result<String, Error> {
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

pub async fn search_igdb(query: &str, env: &Env) -> Result<String, Error> {
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

pub async fn search_isbn(query: &str) -> Result<String, Error> {
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
