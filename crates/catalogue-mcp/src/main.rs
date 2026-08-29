use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo};
use rmcp::{ErrorData as McpError, ServerHandler, ServiceExt, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Map, Value, json};

use erika_catalogue_mcp::fuzzy::{self, fold_for_search};

const DEFAULT_DATA_URL: &str = "https://erika.florist/catalogue/mcp.json";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const SUMMARY_KEYS: [&str; 12] = [
    "id",
    "type",
    "title",
    "status",
    "tmdb_id",
    "igdb_id",
    "isbn",
    "rating",
    "rating_number",
    "release_year",
    "finished_date",
    "author",
];

struct CatEntry {
    raw: Value,
    id: String,
    kind: String,
    title: String,
    status: String,
    rating: Option<String>,
    rating_number: Option<f64>,
    finished_date: Option<String>,
    release_year: Option<i64>,
    author: Option<String>,
    genres: Vec<String>,
    tmdb_id: Option<i64>,
    igdb_id: Option<i64>,
    content: String,
}

impl CatEntry {
    fn from_raw(raw: Value) -> Self {
        let get_str = |k: &str| raw.get(k).and_then(Value::as_str).map(str::to_owned);
        CatEntry {
            id: get_str("id").unwrap_or_default(),
            kind: get_str("type").unwrap_or_default(),
            title: get_str("title").unwrap_or_default(),
            status: get_str("status").unwrap_or_default(),
            rating: get_str("rating"),
            rating_number: raw.get("rating_number").and_then(Value::as_f64),
            finished_date: get_str("finished_date"),
            release_year: raw.get("release_year").and_then(Value::as_i64),
            author: get_str("author"),
            genres: raw
                .get("genres")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default(),
            tmdb_id: raw.get("tmdb_id").and_then(Value::as_i64),
            igdb_id: raw.get("igdb_id").and_then(Value::as_i64),
            content: get_str("content").unwrap_or_default(),
            raw,
        }
    }
}

fn cache_file() -> Result<std::path::PathBuf, String> {
    #[allow(deprecated)]
    std::env::home_dir()
        .map(|h| {
            h.join(".cache")
                .join("erika-catalogue-mcp")
                .join("data.json")
        })
        .ok_or_else(|| "could not determine home directory".to_owned())
}

fn fetch(url: &str) -> Result<String, String> {
    let mut res = ureq::get(url).call().map_err(|e| e.to_string())?;
    res.body_mut()
        .with_config()
        .limit(64 * 1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())
}

fn parse_doc(text: &str) -> Result<Vec<CatEntry>, String> {
    let doc: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let entries = doc
        .get("entries")
        .and_then(Value::as_array)
        .ok_or("missing `entries` array")?;
    Ok(entries.iter().cloned().map(CatEntry::from_raw).collect())
}

fn read_cached(cache: &std::path::Path) -> Result<Vec<CatEntry>, String> {
    parse_doc(&std::fs::read_to_string(cache).map_err(|e| e.to_string())?)
}

fn load_data(force_refresh: bool) -> Result<Vec<CatEntry>, String> {
    let cache = cache_file()?;

    if !force_refresh
        && let Ok(meta) = std::fs::metadata(&cache)
        && let Ok(modified) = meta.modified()
        && modified.elapsed().is_ok_and(|age| age < CACHE_TTL)
        && let Ok(entries) = read_cached(&cache)
    {
        return Ok(entries);
    }

    let url = std::env::var("CATALOGUE_URL").unwrap_or_else(|_| DEFAULT_DATA_URL.to_owned());
    let fetched = fetch(&url).and_then(|text| parse_doc(&text).map(|entries| (text, entries)));
    match fetched {
        Ok((text, entries)) => {
            if let Some(dir) = cache.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(&cache, &text);
            Ok(entries)
        }
        Err(err) => read_cached(&cache)
            .map_err(|_| format!("Failed to fetch {url} and no local cache available: {err}")),
    }
}

fn pick(source: &Value, keys: &[&str]) -> Value {
    let mut out = Map::new();
    for key in keys {
        if let Some(v) = source.get(*key) {
            out.insert((*key).to_owned(), v.clone());
        }
    }
    Value::Object(out)
}

fn summarize(e: &CatEntry) -> Value {
    pick(&e.raw, &SUMMARY_KEYS)
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn text_result(text: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text)])
}

fn json_result(payload: &Value) -> CallToolResult {
    text_result(serde_json::to_string_pretty(payload).unwrap_or_default())
}

fn error_result(text: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(text)])
}

#[derive(Deserialize, JsonSchema, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum EntryKind {
    Game,
    Movie,
    Show,
    Book,
}

impl EntryKind {
    fn as_str(self) -> &'static str {
        match self {
            EntryKind::Game => "game",
            EntryKind::Movie => "movie",
            EntryKind::Show => "show",
            EntryKind::Book => "book",
        }
    }
}

#[derive(Deserialize, JsonSchema, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum EntryStatus {
    Finished,
    Planned,
}

impl EntryStatus {
    fn as_str(self) -> &'static str {
        match self {
            EntryStatus::Finished => "finished",
            EntryStatus::Planned => "planned",
        }
    }
}

#[derive(Deserialize, JsonSchema, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
enum SortKey {
    Relevance,
    FinishedDate,
    Rating,
    ReleaseYear,
    Title,
}

#[derive(Deserialize, JsonSchema, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum SortOrder {
    Asc,
    Desc,
}

#[derive(Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum SummaryField {
    Title,
    Status,
    TmdbId,
    IgdbId,
    Isbn,
    Rating,
    RatingNumber,
    ReleaseYear,
    FinishedDate,
    Author,
}

impl SummaryField {
    fn as_str(self) -> &'static str {
        match self {
            SummaryField::Title => "title",
            SummaryField::Status => "status",
            SummaryField::TmdbId => "tmdb_id",
            SummaryField::IgdbId => "igdb_id",
            SummaryField::Isbn => "isbn",
            SummaryField::Rating => "rating",
            SummaryField::RatingNumber => "rating_number",
            SummaryField::ReleaseYear => "release_year",
            SummaryField::FinishedDate => "finished_date",
            SummaryField::Author => "author",
        }
    }
}

fn default_limit() -> u64 {
    50
}

fn default_recent_limit() -> u64 {
    20
}

#[derive(Deserialize, JsonSchema)]
struct SearchInput {
    #[schemars(description = "Restrict to one entry type")]
    r#type: Option<EntryKind>,
    #[schemars(
        description = "Restrict to finished entries (rated, consumed) or planned ones (queued, not yet rated)"
    )]
    status: Option<EntryStatus>,
    #[schemars(
        description = "Minimum rating. 0=Hated, 1=Disliked, 2=Okay, 3=Liked, 4=Loved, 5=Masterpiece",
        range(min = 0, max = 5)
    )]
    rating_at_least: Option<f64>,
    #[schemars(description = "Exact original release year of the work")]
    year: Option<i64>,
    #[schemars(description = "Released in or after this year (inclusive)")]
    year_after: Option<i64>,
    #[schemars(description = "Released in or before this year (inclusive)")]
    year_before: Option<i64>,
    #[schemars(description = "Year Erika finished/consumed it")]
    finished_year: Option<i64>,
    #[schemars(description = "ISO date (YYYY-MM-DD); only entries finished on/after this date")]
    finished_after: Option<String>,
    #[schemars(description = "ISO date (YYYY-MM-DD); only entries finished on/before this date")]
    finished_before: Option<String>,
    #[schemars(description = "Case-insensitive substring match on a genre name")]
    genre: Option<String>,
    #[schemars(
        description = "Fuzzy match on title or author. Tolerant of typos, partial matches, and word reordering. Results are ranked by relevance."
    )]
    query: Option<String>,
    #[schemars(
        description = "Case-insensitive substring match against the body of the written review. Useful for finding entries that talk about a specific thing, e.g. 'camera' or 'pacing'."
    )]
    mentions: Option<String>,
    #[schemars(
        description = "Sort key. Defaults to 'relevance' when `query` is set, otherwise 'finished_date'."
    )]
    sort: Option<SortKey>,
    #[schemars(description = "Sort direction. Defaults to 'desc' (or 'asc' when sort='title').")]
    order: Option<SortOrder>,
    #[schemars(
        description = "Project results down to only these fields (`id` and `type` are always included). Use for cheap bulk pulls, e.g. fields:['rating_number'] with a high limit to grab the whole catalogue in one call."
    )]
    fields: Option<Vec<SummaryField>>,
    #[serde(default = "default_limit")]
    #[schemars(range(min = 1, max = 1000))]
    limit: u64,
    #[serde(default)]
    #[schemars(description = "Skip this many results before returning (pagination).")]
    offset: u64,
}

#[derive(Deserialize, JsonSchema)]
struct GetEntryInput {
    r#type: EntryKind,
    #[schemars(description = "Entry slug, e.g. 'hotline-miami'")]
    id: String,
}

#[derive(Deserialize, JsonSchema)]
struct CheckInput {
    #[schemars(description = "TMDb IDs; match against movies and shows")]
    tmdb_ids: Option<Vec<i64>>,
    #[schemars(description = "IGDB IDs; match against games")]
    igdb_ids: Option<Vec<i64>>,
    #[schemars(description = "Catalogue slugs, e.g. 'hotline-miami'")]
    ids: Option<Vec<String>>,
}

#[derive(Deserialize, JsonSchema)]
struct ListRecentInput {
    r#type: Option<EntryKind>,
    #[serde(default = "default_recent_limit")]
    #[schemars(range(min = 1, max = 100))]
    limit: u64,
}

#[derive(Deserialize, JsonSchema)]
struct RatingSummaryInput {
    #[schemars(description = "Restrict to one entry type")]
    r#type: Option<EntryKind>,
    #[schemars(description = "Case-insensitive match on a genre name")]
    genre: Option<String>,
    #[schemars(
        description = "Case-insensitive match on the author field (company/developer/writer)"
    )]
    author: Option<String>,
}

#[derive(Clone)]
struct CatalogueServer {
    entries: Arc<RwLock<Arc<Vec<CatEntry>>>>,
    tool_router: ToolRouter<Self>,
}

impl CatalogueServer {
    fn new(entries: Vec<CatEntry>) -> Self {
        Self {
            entries: Arc::new(RwLock::new(Arc::new(entries))),
            tool_router: Self::tool_router(),
        }
    }

    fn entries(&self) -> Arc<Vec<CatEntry>> {
        self.entries.read().expect("entries lock").clone()
    }
}

fn cmp_f64(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

fn tie_break(a: &CatEntry, b: &CatEntry) -> std::cmp::Ordering {
    cmp_f64(
        b.rating_number.unwrap_or(-1.0),
        a.rating_number.unwrap_or(-1.0),
    )
    .then_with(|| {
        b.finished_date
            .as_deref()
            .unwrap_or("")
            .cmp(a.finished_date.as_deref().unwrap_or(""))
    })
}

#[tool_router]
impl CatalogueServer {
    #[tool(
        description = "Search and filter Erika's catalogue (games, movies, shows, books). Returns concise summaries; use get_entry to pull the full Markdown review."
    )]
    async fn search_catalogue(
        &self,
        Parameters(input): Parameters<SearchInput>,
    ) -> Result<CallToolResult, McpError> {
        let entries = self.entries();
        let genre = input.genre.as_ref().map(|s| s.to_lowercase());
        let mentions = input.mentions.as_ref().map(|s| s.to_lowercase());

        let mut results: Vec<&CatEntry> = entries
            .iter()
            .filter(|e| {
                if input.r#type.is_some_and(|t| e.kind != t.as_str()) {
                    return false;
                }
                if input.status.is_some_and(|s| e.status != s.as_str()) {
                    return false;
                }
                if input
                    .rating_at_least
                    .is_some_and(|min| !e.rating_number.is_some_and(|r| r >= min))
                {
                    return false;
                }
                if input.year.is_some_and(|y| e.release_year != Some(y)) {
                    return false;
                }
                if input
                    .year_after
                    .is_some_and(|y| !e.release_year.is_some_and(|r| r >= y))
                {
                    return false;
                }
                if input
                    .year_before
                    .is_some_and(|y| !e.release_year.is_some_and(|r| r <= y))
                {
                    return false;
                }
                if let Some(fy) = input.finished_year {
                    let Some(fd) = &e.finished_date else {
                        return false;
                    };
                    if fd.get(..4).and_then(|y| y.parse::<i64>().ok()) != Some(fy) {
                        return false;
                    }
                }
                if let Some(after) = &input.finished_after {
                    let Some(fd) = &e.finished_date else {
                        return false;
                    };
                    if fd < after {
                        return false;
                    }
                }
                if let Some(before) = &input.finished_before {
                    let Some(fd) = &e.finished_date else {
                        return false;
                    };
                    if fd > before {
                        return false;
                    }
                }
                if let Some(g) = &genre
                    && !e.genres.iter().any(|x| x.to_lowercase().contains(g))
                {
                    return false;
                }
                if let Some(m) = &mentions
                    && !e.content.to_lowercase().contains(m)
                {
                    return false;
                }
                true
            })
            .collect();

        let query = input.query.as_deref().filter(|q| !q.is_empty());
        if let Some(q) = query {
            let items: Vec<Vec<String>> = results
                .iter()
                .map(|e| vec![e.title.clone(), e.author.clone().unwrap_or_default()])
                .collect();
            let ranked = fuzzy::search(&items, 0, q);
            results = ranked.into_iter().map(|i| results[i]).collect();
        }

        let mut sort = input.sort.unwrap_or(if query.is_some() {
            SortKey::Relevance
        } else {
            SortKey::FinishedDate
        });
        if sort == SortKey::Relevance && query.is_none() {
            sort = SortKey::FinishedDate;
        }
        if sort != SortKey::Relevance {
            let default_order = if sort == SortKey::Title {
                SortOrder::Asc
            } else {
                SortOrder::Desc
            };
            let order = input.order.unwrap_or(default_order);
            results.sort_by(|a, b| {
                let c = match sort {
                    SortKey::FinishedDate => a
                        .finished_date
                        .as_deref()
                        .unwrap_or("")
                        .cmp(b.finished_date.as_deref().unwrap_or("")),
                    SortKey::Rating => cmp_f64(
                        a.rating_number.unwrap_or(-1.0),
                        b.rating_number.unwrap_or(-1.0),
                    ),
                    SortKey::ReleaseYear => a
                        .release_year
                        .unwrap_or(0)
                        .cmp(&b.release_year.unwrap_or(0)),
                    SortKey::Title => fold_for_search(&a.title).cmp(&fold_for_search(&b.title)),
                    SortKey::Relevance => unreachable!(),
                };
                let c = if order == SortOrder::Desc {
                    c.reverse()
                } else {
                    c
                };
                c.then_with(|| tie_break(a, b))
            });
        }

        let limit = input.limit.clamp(1, 1000) as usize;
        let offset = input.offset as usize;
        let field_keys: Option<Vec<&str>> = input.fields.as_ref().map(|fields| {
            let mut keys = vec!["id", "type"];
            keys.extend(fields.iter().map(|f| f.as_str()));
            keys
        });
        let projected: Vec<Value> = results
            .iter()
            .skip(offset)
            .take(limit)
            .map(|e| {
                let summary = summarize(e);
                match &field_keys {
                    None => summary,
                    Some(keys) => pick(&summary, keys),
                }
            })
            .collect();

        let payload = json!({
            "total_matches": results.len(),
            "offset": offset,
            "returned": projected.len(),
            "results": projected,
        });
        Ok(json_result(&payload))
    }

    #[tool(
        description = "Get a full catalogue entry, including Erika's written review as raw Markdown in `content`."
    )]
    async fn get_entry(
        &self,
        Parameters(input): Parameters<GetEntryInput>,
    ) -> Result<CallToolResult, McpError> {
        let entries = self.entries();
        let kind = input.r#type.as_str();
        if let Some(entry) = entries.iter().find(|e| e.kind == kind && e.id == input.id) {
            return Ok(text_result(
                serde_json::to_string_pretty(&entry.raw).unwrap_or_default(),
            ));
        }

        let pool: Vec<&CatEntry> = entries.iter().filter(|e| e.kind == kind).collect();
        let items: Vec<Vec<String>> = pool
            .iter()
            .map(|e| vec![e.id.clone(), e.title.clone()])
            .collect();
        // External slugs often carry a -YEAR/-N suffix ours lack; drop it so it doesn't sink the fuzzy score.
        let mut probe = input.id.clone();
        if let Some(pos) = probe.rfind('-')
            && probe.len() > pos + 1
            && probe[pos + 1..].bytes().all(|b| b.is_ascii_digit())
        {
            probe.truncate(pos);
        }
        let probe = probe.replace('-', " ");
        let suggestions: Vec<String> = fuzzy::search(&items, 0, &probe)
            .into_iter()
            .take(5)
            .map(|i| format!("{} ({})", pool[i].id, pool[i].title))
            .collect();
        let text = if suggestions.is_empty() {
            format!("No {kind} found with id \"{}\".", input.id)
        } else {
            format!(
                "No {kind} found with id \"{}\". Did you mean: {}?",
                input.id,
                suggestions.join(", ")
            )
        };
        Ok(error_result(text))
    }

    #[tool(
        description = "Batch existence check. Given external IDs (TMDb for movies/shows, IGDB for games) and/or catalogue slugs, report which items Erika has already logged and how she rated them. Use this to cross-reference a candidate list against her catalogue in one call — the `not_found` bucket is exactly the set she hasn't logged. Prefer this over many get_entry calls, and prefer external IDs over slugs (slugs can differ from other sources; IDs are exact)."
    )]
    async fn check_catalogue(
        &self,
        Parameters(input): Parameters<CheckInput>,
    ) -> Result<CallToolResult, McpError> {
        let tmdb_ids = input.tmdb_ids.unwrap_or_default();
        let igdb_ids = input.igdb_ids.unwrap_or_default();
        let ids = input.ids.unwrap_or_default();
        if tmdb_ids.is_empty() && igdb_ids.is_empty() && ids.is_empty() {
            return Ok(error_result(
                "Provide at least one of tmdb_ids, igdb_ids, or ids.",
            ));
        }

        let entries = self.entries();
        let mut by_tmdb: HashMap<i64, &CatEntry> = HashMap::new();
        let mut by_igdb: HashMap<i64, &CatEntry> = HashMap::new();
        let mut by_slug: HashMap<&str, &CatEntry> = HashMap::new();
        for e in entries.iter() {
            if let Some(t) = e.tmdb_id {
                by_tmdb.insert(t, e);
            }
            if let Some(g) = e.igdb_id {
                by_igdb.insert(g, e);
            }
            by_slug.insert(&e.id, e);
        }

        let mut found: Vec<Value> = Vec::new();
        let mut nf_tmdb: Vec<i64> = Vec::new();
        let mut nf_igdb: Vec<i64> = Vec::new();
        let mut nf_ids: Vec<String> = Vec::new();
        let found_obj = |matched_by: &str, query: Value, e: &CatEntry| {
            let mut m = Map::new();
            m.insert(
                "matched_by".to_owned(),
                Value::String(matched_by.to_owned()),
            );
            m.insert("query".to_owned(), query);
            if let Value::Object(summary) = summarize(e) {
                m.extend(summary);
            }
            Value::Object(m)
        };

        for t in tmdb_ids {
            match by_tmdb.get(&t) {
                Some(e) => found.push(found_obj("tmdb_id", json!(t), e)),
                None => nf_tmdb.push(t),
            }
        }
        for g in igdb_ids {
            match by_igdb.get(&g) {
                Some(e) => found.push(found_obj("igdb_id", json!(g), e)),
                None => nf_igdb.push(g),
            }
        }
        for s in ids {
            match by_slug.get(s.as_str()) {
                Some(e) => found.push(found_obj("id", json!(s), e)),
                None => nf_ids.push(s),
            }
        }

        let payload = json!({
            "found_count": found.len(),
            "not_found_count": nf_tmdb.len() + nf_igdb.len() + nf_ids.len(),
            "found": found,
            "not_found": { "tmdb_ids": nf_tmdb, "igdb_ids": nf_igdb, "ids": nf_ids },
        });
        Ok(json_result(&payload))
    }

    #[tool(description = "List recently-finished entries, newest first.")]
    async fn list_recent(
        &self,
        Parameters(input): Parameters<ListRecentInput>,
    ) -> Result<CallToolResult, McpError> {
        let entries = self.entries();
        let mut recent: Vec<&CatEntry> = entries
            .iter()
            .filter(|e| input.r#type.is_none_or(|t| e.kind == t.as_str()))
            .filter(|e| e.finished_date.is_some())
            .collect();
        recent.sort_by(|a, b| {
            b.finished_date
                .as_deref()
                .unwrap_or("")
                .cmp(a.finished_date.as_deref().unwrap_or(""))
        });
        let limit = input.limit.clamp(1, 100) as usize;
        let payload: Vec<Value> = recent.iter().take(limit).map(|e| summarize(e)).collect();
        Ok(json_result(&json!(payload)))
    }

    #[tool(
        description = "Overall catalogue stats over finished entries (planned backlog excluded): counts per type, average ratings, latest finished date."
    )]
    async fn stats(&self) -> Result<CallToolResult, McpError> {
        let entries = self.entries();
        let mut by_type: std::collections::BTreeMap<&str, (u64, f64, u64)> =
            std::collections::BTreeMap::new();
        let mut latest: Option<&str> = None;
        let mut total = 0u64;
        for e in entries.iter().filter(|e| e.status != "planned") {
            total += 1;
            let bucket = by_type.entry(&e.kind).or_insert((0, 0.0, 0));
            bucket.0 += 1;
            if let Some(r) = e.rating_number {
                bucket.1 += r;
                bucket.2 += 1;
            }
            if let Some(fd) = e.finished_date.as_deref()
                && latest.is_none_or(|l| fd > l)
            {
                latest = Some(fd);
            }
        }
        let by_type: Map<String, Value> = by_type
            .into_iter()
            .map(|(kind, (count, sum, rated))| {
                let average = if rated > 0 {
                    json!(round2(sum / rated as f64))
                } else {
                    Value::Null
                };
                (
                    kind.to_owned(),
                    json!({ "count": count, "average_rating": average }),
                )
            })
            .collect();
        let payload = json!({
            "total": total,
            "by_type": by_type,
            "latest_finished_date": latest,
        });
        Ok(json_result(&payload))
    }

    #[tool(
        description = "Aggregate how Erika rates a slice of the catalogue defined by genre and/or author. Returns count, average rating, the full rating distribution, and her top-rated examples in that slice. `author` matches the same field search exposes: production company for movies, developer for games, writer for books — directors are NOT stored. Answers questions like 'how does she rate horror?' or 'what's her average for FromSoftware?'."
    )]
    async fn rating_summary(
        &self,
        Parameters(input): Parameters<RatingSummaryInput>,
    ) -> Result<CallToolResult, McpError> {
        if input.genre.is_none() && input.author.is_none() && input.r#type.is_none() {
            return Ok(error_result(
                "Provide at least one of genre, author, or type.",
            ));
        }
        let entries = self.entries();
        let genre = input.genre.as_deref().map(fold_for_search);
        let author = input.author.as_deref().map(fold_for_search);
        let matched: Vec<&CatEntry> = entries
            .iter()
            .filter(|e| {
                if input.r#type.is_some_and(|t| e.kind != t.as_str()) {
                    return false;
                }
                if let Some(g) = &genre
                    && !e
                        .genres
                        .iter()
                        .any(|x| fold_for_search(x).contains(g.as_str()))
                {
                    return false;
                }
                if let Some(a) = &author
                    && !fold_for_search(e.author.as_deref().unwrap_or("")).contains(a.as_str())
                {
                    return false;
                }
                true
            })
            .collect();

        let labels = ["Masterpiece", "Loved", "Liked", "Okay", "Disliked", "Hated"];
        let mut distribution: HashMap<&str, u64> = labels.iter().map(|l| (*l, 0)).collect();
        let mut sum = 0.0;
        let mut rated = 0u64;
        for e in &matched {
            let (Some(n), Some(label)) = (e.rating_number, e.rating.as_deref()) else {
                continue;
            };
            sum += n;
            rated += 1;
            if let Some(count) = distribution.get_mut(label) {
                *count += 1;
            }
        }
        let distribution: Map<String, Value> = labels
            .iter()
            .map(|l| ((*l).to_owned(), json!(distribution[l])))
            .collect();

        let mut examples: Vec<&CatEntry> = matched.clone();
        examples.sort_by(|a, b| {
            cmp_f64(
                b.rating_number.unwrap_or(-1.0),
                a.rating_number.unwrap_or(-1.0),
            )
        });
        let examples: Vec<Value> = examples.iter().take(5).map(|e| summarize(e)).collect();

        let average = if rated > 0 {
            json!(round2(sum / rated as f64))
        } else {
            Value::Null
        };
        let payload = json!({
            "count": matched.len(),
            "average_rating": average,
            "distribution": distribution,
            "examples": examples,
        });
        Ok(json_result(&payload))
    }

    #[tool(
        description = "Refetch the catalogue from the live JSON endpoint, bypassing the 24h cache. Use this if entries have been added or updated since the server started."
    )]
    async fn refresh(&self) -> Result<CallToolResult, McpError> {
        let before = self.entries().len();
        let fresh = tokio::task::spawn_blocking(|| load_data(true))
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?
            .map_err(|e| McpError::internal_error(e, None))?;
        let count = fresh.len();
        *self.entries.write().expect("entries lock") = Arc::new(fresh);
        Ok(text_result(format!(
            "Refreshed. {count} entries loaded (was {before})."
        )))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for CatalogueServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let force_refresh = std::env::args().any(|a| a == "--refresh");
    let entries = match load_data(force_refresh) {
        Ok(entries) => entries,
        Err(err) => {
            eprintln!("[catalogue-mcp] fatal: {err}");
            std::process::exit(1);
        }
    };
    let service = CatalogueServer::new(entries)
        .serve(rmcp::transport::stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}
