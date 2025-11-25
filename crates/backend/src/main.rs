use axum::{
    Router,
    extract::{Form, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::{Engine as _, engine::general_purpose};
use erikaflorist::content::{
    BlogPost, CatalogueMovie, ContentSources, Project, WikiEntry, content_sources,
};
use maud::{Markup, PreEscaped, html};
use maudit::{
    assets::{RouteAssets, RouteAssetsOptions},
    content::Entry,
    route::PageContext,
};
use schemars::schema_for;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::services::ServeDir;

mod templates;

#[derive(Debug, Clone)]
struct EntryDisplay {
    id: String,
    title: String,
    description: Option<String>,
    date: Option<String>,
    draft: Option<bool>,
    category: Option<String>,
    cover: Option<(String, String)>,
}

fn is_dev() -> bool {
    dotenvy::var("IS_DEV")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase()
        == "true"
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::from_filename(".env.dev");
    let _ = dotenvy::from_filename(".env");

    let mut content = content_sources("../website".to_owned());

    content.init_all();

    let shared_content = Arc::new(content);

    // build our application with a route
    let app = Router::new()
        .route("/", get(index))
        .route("/catalogue/add", get(catalogue_add_handler))
        .route(
            "/catalogue/add",
            axum::routing::post(catalogue_add_post_handler),
        )
        .route("/catalogue/proxy", get(catalogue_proxy_handler))
        .route(
            "/catalogue/books",
            get(|state| catalogue_handler(state, "books")),
        )
        .route(
            "/catalogue/movies",
            get(|state| catalogue_handler(state, "movies")),
        )
        .route(
            "/catalogue/shows",
            get(|state| catalogue_handler(state, "shows")),
        )
        .route(
            "/catalogue/games",
            get(|state| catalogue_handler(state, "games")),
        )
        .route("/{source}", get(content_source_handler))
        .route("/{source}/{entry}", get(entry_handler))
        .nest_service("/assets", ServeDir::new("static"))
        .with_state(shared_content);

    // run it
    let port = std::env::var("PORT").unwrap_or_else(|_| "10000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn index(State(content): State<Arc<ContentSources>>) -> Markup {
    templates::base_template(content.as_ref(), html! {})
}

async fn content_source_handler(
    State(content): State<Arc<ContentSources>>,
    Path(source): Path<String>,
) -> Markup {
    let entries = get_entries_for_source(&content, &source);

    templates::base_template(
        content.as_ref(),
        html! {
            div {
                h1.text-3xl.font-bold.text-gray-900.mb-6.capitalize { (source) }
                (render_entries_list(&entries, &source))
            }
        },
    )
}

macro_rules! dummy_context {
    ($content:expr) => {{
        PageContext {
            content: $content,
            current_path: &String::new(),
            params: &(),
            props: &(),
            assets: &mut RouteAssets::new(
                &RouteAssetsOptions {
                    hashing_strategy: if is_dev() {
                        maudit::AssetHashingStrategy::FastImprecise
                    } else {
                        maudit::AssetHashingStrategy::Precise
                    },
                    ..Default::default()
                },
                None,
            ),
            base_url: &None,
        }
    }};
}

fn get_entries_for_source(content: &ContentSources, source: &str) -> Vec<EntryDisplay> {
    let mut ctx = dummy_context!(content);

    match source {
        "blog" => {
            let blog_source = content.get_source::<BlogPost>("blog");

            // Map to EntryDisplay
            blog_source
                .entries
                .iter()
                .map(|entry| {
                    let data = entry.data(&mut ctx);
                    EntryDisplay {
                        id: entry.id.clone(),
                        title: data.title.clone(),
                        description: data.tagline.clone(),
                        date: Some(data.date.format("%B %d, %Y").to_string()),
                        draft: data.draft,
                        category: None,
                        cover: None,
                    }
                })
                .collect()
        }
        "wiki" => {
            let wiki_source = content.get_source::<WikiEntry>("wiki");

            wiki_source
                .entries
                .iter()
                .map(|entry| {
                    let data = entry.data(&mut ctx);
                    EntryDisplay {
                        id: entry.id.clone(),
                        title: data.title.clone(),
                        description: data.tagline.clone(),
                        date: None,
                        draft: None,
                        category: Some(data.navigation.category.clone()),
                        cover: None,
                    }
                })
                .collect()
        }
        "projects" => {
            let projects_source = content.get_source::<Project>("projects");

            projects_source
                .entries
                .iter()
                .map(|entry| {
                    let data = entry.data(&mut ctx);
                    EntryDisplay {
                        id: entry.id.clone(),
                        title: data.title.clone(),
                        description: data.tagline.clone(),
                        date: None,
                        draft: None,
                        category: None,
                        cover: None,
                    }
                })
                .collect()
        }
        "movies" => {
            let movies_source = content.get_source::<CatalogueMovie>("movies");

            movies_source
                .entries
                .iter()
                .map(|entry| {
                    let data = entry.data(&mut ctx);
                    EntryDisplay {
                        id: entry.id.clone(),
                        title: data.title.clone(),
                        description: None,
                        date: data
                            .finished_date
                            .map(|release_year| release_year.to_string()),
                        draft: None,
                        category: None,
                        cover: Some(data.cover.clone()),
                    }
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

fn render_single_entry(entry: &EntryDisplay, source: &str) -> Markup {
    let draft = entry.draft.unwrap_or(false);
    html! {
        a.block.px-4.py-3.border-b.border-gray-200.hover:bg-gray-50.transition-colors.duration-150.cursor-pointer.text-decoration-none.(if draft {"bg-yellow-200/10"} else {""}) href=(format!("/{}/{}", source, entry.id)) {
            div.flex.items-center.justify-between {
                div.flex-1.min-w-0 {
                    h3.text-sm.font-medium.text-gray-900.truncate {
                        (entry.title)
                        @if draft {
                            span.text-xs.text-red-500.ml-2 { "(Draft)" }
                        }
                    }
                    @if let Some(description) = &entry.description {
                        p.text-xs.text-gray-500.mt-1.truncate {
                            (description)
                        }
                    }
                    @if let Some(date) = &entry.date {
                        p.text-xs.text-gray-400.mt-1 {
                            (date)
                        }
                    }
                }
                div {
                    svg.w-4.h-4.text-gray-400 fill="currentColor" viewBox="0 0 20 20" {
                        path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" {}
                    }
                }
            }
        }
    }
}

fn render_entry_group(title: &str, entries: &[&EntryDisplay], source: &str) -> Markup {
    html! {
        div.mb-6 {
            h2.text-lg.font-semibold.text-gray-800.px-4.py-2.bg-gray-50.border-b-2.border-gray-200 {
                (title)
            }
            @for entry in entries {
                (render_single_entry(entry, source))
            }
        }
    }
}

fn format_category_name(category: &str) -> String {
    category
        .replace('-', " ")
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn render_entries_list(entries: &[EntryDisplay], source: &str) -> Markup {
    use std::collections::HashMap;

    // Sort all entries first by date (newest first) or title
    let mut sorted_entries: Vec<&EntryDisplay> = entries.iter().collect();
    sorted_entries.sort_by(|a, b| {
        match (&a.date, &b.date) {
            (Some(a_date), Some(b_date)) => b_date.cmp(a_date), // Newest first
            (None, None) => a.title.cmp(&b.title),
            (Some(_), None) => std::cmp::Ordering::Less, // Dated entries first
            (None, Some(_)) => std::cmp::Ordering::Greater,
        }
    });

    // Group sorted entries by category (they maintain their sort order)
    let mut categories: HashMap<String, Vec<&EntryDisplay>> = HashMap::new();
    let mut uncategorized: Vec<&EntryDisplay> = Vec::new();

    for entry in sorted_entries {
        if let Some(category) = &entry.category {
            categories.entry(category.clone()).or_default().push(entry);
        } else {
            uncategorized.push(entry);
        }
    }

    // Sort categories by name
    let mut sorted_categories: Vec<_> = categories.into_iter().collect();
    sorted_categories.sort_by_key(|(category, _)| category.clone());

    html! {
        div.bg-white {
            @if entries.is_empty() {
                div.flex.items-center.justify-center.h-64 {
                    p.text-gray-500 { "No entries found." }
                }
            } @else {
                // Render uncategorized entries first without a header
                @for entry in &uncategorized {
                    (render_single_entry(entry, source))
                }

                // Render categorized entries with headers
                @for (category, category_entries) in sorted_categories {
                    (render_entry_group(&format_category_name(&category), &category_entries, source))
                }
            }
        }
    }
}

enum ContentEntryType<'a> {
    Blog(&'a Entry<BlogPost>),
    Wiki(&'a Entry<WikiEntry>),
    Project(&'a Entry<Project>),
}

impl<'a> ContentEntryType<'a> {
    fn get_content(&self) -> &str {
        match self {
            ContentEntryType::Blog(entry) => entry.raw_content.as_ref().unwrap(),
            ContentEntryType::Wiki(entry) => entry.raw_content.as_ref().unwrap(),
            ContentEntryType::Project(entry) => entry.raw_content.as_ref().unwrap(),
        }
    }

    fn get_json_data(&self, ctx: &mut PageContext) -> serde_json::Value {
        match self {
            ContentEntryType::Blog(entry) => serde_json::to_value(entry.data(ctx)).unwrap(),
            ContentEntryType::Wiki(entry) => serde_json::to_value(entry.data(ctx)).unwrap(),
            ContentEntryType::Project(entry) => serde_json::to_value(entry.data(ctx)).unwrap(),
        }
    }
}

async fn entry_handler(
    State(content): State<Arc<ContentSources>>,
    Path((source, entry_id)): Path<(String, String)>,
) -> Markup {
    let mut ctx = dummy_context!(&content);
    let (json_schema, entry) = match source.as_str() {
        "blog" => {
            let blog_source = content.get_source::<BlogPost>("blog");
            (
                schema_for!(BlogPost),
                ContentEntryType::Blog(blog_source.get_entry(&entry_id)),
            )
        }
        "wiki" => {
            let wiki_source = content.get_source::<WikiEntry>("wiki");
            (
                schema_for!(WikiEntry),
                ContentEntryType::Wiki(wiki_source.get_entry(&entry_id)),
            )
        }
        "projects" => {
            let projects_source = content.get_source::<Project>("projects");
            (
                schema_for!(Project),
                ContentEntryType::Project(projects_source.get_entry(&entry_id)),
            )
        }
        _ => unreachable!(),
    };

    let entry_content = entry.get_content();
    // Separate frontmatter from content if needed
    let (_frontmatter, body) = if let Some(stripped) = entry_content.strip_prefix("---") {
        if let Some(end) = stripped.find("---") {
            let fm = &stripped[..end];
            let cnt = &stripped[end + 3..];
            (fm, cnt)
        } else {
            ("", entry_content)
        }
    } else {
        ("", entry_content)
    };

    let script_content = PreEscaped(format!(
        r#"
        import {{ ink, defineOptions }} from 'https://esm.sh/ink-mde@0.22.0';

        {}
        const json_schema = JSON.parse(`{}`);

        const options = defineOptions({{
            doc: `{}`,
            interface: {{
                toolbar: true,
                appearance: 'light',
            }}
        }});

        ink(document.getElementById('editor'), options);
        schemaToForm(json_schema, document.getElementById('form-container'), {});
    "#,
        include_str!("./schema-to-form.js"),
        serde_json::to_string(&json_schema)
            .unwrap()
            .replace('`', r"\`"),
        // Escape ${ to prevent template literal issues
        body.replace('`', r"\`").replace("${", r"\${").trim(),
        entry.get_json_data(&mut ctx)
    ));

    templates::base_template(
        content.as_ref(),
        html! {
            div.flex.flex-col.md:flex-row.md:space-x-6 {
              article."md:w-2/3"."lg:w-3/4" {
                div #editor {};
              }
              aside."lg:w-1/4".mb-6.md:mb-0 {
                div #form-container {};
              }
              script type="module" {
                  (script_content)
              }
            }
        },
    )
}

fn render_catalogue_grid(entries: &[EntryDisplay], source: &str) -> Markup {
    html! {
        @if entries.is_empty() {
            div.flex.items-center.justify-center.h-64 {
                p.text-gray-500 { "No entries found." }
            }
        } @else {
            div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" {
                @for entry in entries {
                    (render_catalogue_card(entry, source))
                }
            }
        }
    }
}

fn render_catalogue_card(entry: &EntryDisplay, source: &str) -> Markup {
    let draft = entry.draft.unwrap_or(false);
    let cover_origin = if is_dev() {
        "http://localhost:1864"
    } else {
        "https://erika.florist"
    };
    html! {
        a.block.bg-white.rounded-lg.shadow-md.hover:shadow-lg.transition-shadow.duration-200.overflow-hidden.text-decoration-none.(if draft {"opacity-75"} else {""}) href=(format!("/{}/{}", source, entry.id)) {
            @if let Some((cover_url, placeholder)) = &entry.cover {
                div.relative.w-full.h-48.bg-gray-200.rounded-t-lg.overflow-hidden {
                  img.w-full.h-full.object-cover src=(format!("{}{}", cover_origin, cover_url)) alt=(format!("{} cover", entry.title)) loading="lazy" style=(format!("background-image: url(data:image/jpeg;base64,{}); background-size: cover; background-position: center;", placeholder)) {
                    }
                }
            }
            div.p-6 {
                h3.text-lg.font-semibold.text-gray-900.mb-2.line-clamp-2 {
                    (entry.title)
                    @if draft {
                        span.text-xs.text-red-500.ml-2 { "(Draft)" }
                    }
                }
                @if let Some(description) = &entry.description {
                    p.text-sm.text-gray-600.mb-4.line-clamp-3 {
                        (description)
                    }
                }
                div.flex.items-center.justify-between.text-xs.text-gray-500 {
                    @if let Some(category) = &entry.category {
                        span.px-2.py-1.bg-gray-100.rounded-full {
                            (format_category_name(category))
                        }
                    }
                    @if let Some(date) = &entry.date {
                        span {
                            (date)
                        }
                    }
                }
            }
        }
    }
}

async fn catalogue_handler(
    State(content): State<Arc<ContentSources>>,
    source: &'static str,
) -> Markup {
    let entries = get_entries_for_source(&content, source);

    templates::base_template(
        content.as_ref(),
        html! {
            div {
                h1.text-3xl.font-bold.text-gray-900.mb-6.capitalize { "Catalogue: " (source) }
                (render_catalogue_grid(&entries, source))
            }
        },
    )
}

async fn catalogue_add_handler(State(content): State<Arc<ContentSources>>) -> Markup {
    catalogue_add_form(content.as_ref(), None)
}

#[derive(Debug, Deserialize)]
struct CatalogueForm {
    r#type: String,
    name: String,
    rating: String,
    date: String,
    #[serde(rename = "source-id")]
    source_id: String,
    #[serde(rename = "platform-select", default)]
    platform_select: String,
    comment: String,
    form_password: String,
}

#[derive(Serialize, Deserialize)]
struct GitHubRequest {
    message: String,
    content: String,
    committer: GitHubCommitter,
}

#[derive(Serialize, Deserialize)]
struct GitHubCommitter {
    name: String,
    email: String,
}

async fn catalogue_add_post_handler(
    State(content): State<Arc<ContentSources>>,
    Form(form): Form<CatalogueForm>,
) -> Response {
    // Check password
    let form_password = std::env::var("FORM_PASSWORD").unwrap_or_else(|_| "password".to_string());

    if form.form_password != form_password {
        return (
            StatusCode::UNAUTHORIZED,
            catalogue_add_form(content.as_ref(), Some("Invalid password")),
        )
            .into_response();
    }

    // Map type to source key and path
    let (source_key, path_type) = match form.r#type.as_str() {
        "movie" => ("tmdb", "movies"),
        "tv" => ("tmdb", "shows"),
        "game" => ("igdb", "games"),
        "book" => ("isbn", "books"),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                catalogue_add_form(content.as_ref(), Some("Invalid type")),
            )
                .into_response();
        }
    };

    // Create slug
    let mut slug = slug::slugify(&form.name);
    let client = reqwest::Client::new();
    let github_token = std::env::var("GITHUB_KEY").unwrap_or_default();
    let github_repo =
        std::env::var("GITHUB_REPO").unwrap_or_else(|_| "Princesseuh/erika.florist".to_string());

    // Check if file exists on GitHub and increment if needed
    let file_exists =
        check_if_file_exists(&client, &github_token, &github_repo, path_type, &slug).await;

    if file_exists {
        let mut i = 1;
        loop {
            let test_slug = format!("{}-{}", slug, i);
            let file_exists =
                check_if_file_exists(&client, &github_token, &github_repo, path_type, &test_slug)
                    .await;

            if !file_exists {
                slug = test_slug;
                break;
            }
            i += 1;
        }
    }

    // Create markdown content
    let platform_line = if !form.platform_select.is_empty() {
        format!("platform: \"{}\"\n", form.platform_select)
    } else {
        String::new()
    };

    let markdown_content = format!(
        "---\ntitle: \"{}\"\n{}rating: \"{}\"\nfinishedDate: {}\n{}: \"{}\"\n---\n\n{}\n",
        form.name, platform_line, form.rating, form.date, source_key, form.source_id, form.comment
    );

    // Post to GitHub
    let file_path = format!("{}/{}/{}.md", path_type, slug, slug);
    let github_response = post_to_github(
        &client,
        &github_token,
        &github_repo,
        &file_path,
        &markdown_content,
        &form.name,
    )
    .await;

    match github_response {
        Ok(commit_url) => {
            (
                StatusCode::OK,
                templates::base_template(
                    content.as_ref(),
                    html! {
                        div.max-w-2xl.mx-auto {
                            div.bg-green-50.border.border-green-200.rounded-lg.p-6 {
                                h1.text-2xl.font-bold.text-green-800.mb-3 { "✓ Success!" }
                                p.text-green-700.mb-4 {
                                    "Your content has been added to the catalogue. "
                                    a.text-green-800.underline.hover:text-green-900 href=(commit_url) { "View commit on GitHub" }
                                }
                                div.flex.gap-3.mt-6 {
                                    a.px-4.py-2.bg-green-600.hover:bg-green-700.text-white.rounded-md.transition-colors href=(format!("/catalogue/{}", path_type)) {
                                        "Go to catalogue"
                                    }
                                    a.px-4.py-2.bg-white.hover:bg-gray-50.text-green-800.border.border-green-600.rounded-md.transition-colors href="/catalogue/add" {
                                        "Add another"
                                    }
                                }
                            }
                        }
                    },
                ),
            )
                .into_response()
        }
        Err(e) => {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                catalogue_add_form(
                    content.as_ref(),
                    Some(&format!("Failed to create GitHub commit: {}", e)),
                ),
            )
                .into_response()
        }
    }
}

fn catalogue_add_form(content: &ContentSources, error: Option<&str>) -> Markup {
    let ratings = ["Hated", "Disliked", "Okay", "Liked", "Loved", "Masterpiece"];
    let ratings_emoji = ["🙁", "😕", "😐", "🙂", "😍", "❤️"];

    let script_content = PreEscaped(format!(
        r#"
        import {{ ink, defineOptions }} from 'https://esm.sh/ink-mde@0.22.0';

        {}

        const options = defineOptions({{
            doc: '',
            interface: {{
                toolbar: true,
                appearance: 'light',
            }}
        }});

        const editor = ink(document.getElementById('editor'), options);

        // Get content on form submit
        document.querySelector('form').addEventListener('submit', (e) => {{
            document.getElementById('comment').value = editor.getDoc();
        }});
    "#,
        include_str!("./schema-to-form.js"),
    ));

    templates::base_template(
        content,
        html! {
            style {
                r#"
                .loader {
                    width: 20px;
                    height: 20px;
                    border: 3px solid #9ca3af;
                    border-bottom-color: transparent;
                    border-radius: 50%;
                    animation: rotation 1s linear infinite;
                    display: none;
                }
                @keyframes rotation {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .rating-radio {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border-width: 0;
                }
                .rating-radio:checked + label {
                    transform: scale(1.15);
                    filter: grayscale(0%) !important;
                }
                #cover-preview {
                    display: none;
                }
                @media (min-width: 768px) {
                    #cover-preview.show {
                        display: block;
                    }
                }
                input, select, textarea {
                    background-color: white !important;
                }
                "#
            }

            @if let Some(err) = error {
                div.bg-red-100.border.border-red-400.text-red-700.px-4.py-3.rounded.mb-4 {
                    (err)
                }
            }

            form method="post" {
                div.flex.flex-col.md:flex-row.md:space-x-6.gap-6.md:gap-0 {
                    // Center - Editor (shown after rating on mobile)
                    article."order-2"."md:order-1"."md:w-2/3 lg:w-3/4".h-full.min-h-0 {
                        div.h-full #editor {}
                        textarea.hidden name="comment" id="comment" {""}
                    }

                    // Right sidebar - Metadata & Info
                    aside."order-1"."md:order-2"."lg:w-1/4".space-y-6 {
                        // Cover preview (hidden on mobile, shown as background instead)
                        div #cover-preview.space-y-2.hidden.md:block {
                            label.block.text-sm.font-medium.text-gray-700 { "Cover" }
                            img #cover-image.w-full.rounded.shadow-sm src="" alt="Cover";
                        }

                        // Type
                        div.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="type" { "Type" }
                            select.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                required name="type" id="type" {
                                option value="movie" { "Movie" }
                                option value="tv" { "Show" }
                                option value="game" { "Game" }
                                option value="book" { "Book" }
                            }
                        }

                        // Name
                        div.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="name" { "Name" }
                            div.relative {
                                input.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                    type="text" id="name" name="name" list="name-list" placeholder="Search..." required;
                                span.loader.absolute.right-3.top-3 {}
                                datalist id="name-list" {}
                            }
                        }

                        // Rating
                        div.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 { "Rating" }
                            div #rating-list.flex.flex-wrap.justify-center.gap-3.text-4xl.md:text-3xl {
                                @for (i, rating) in ratings.iter().enumerate() {
                                    input.rating-radio type="radio" required name="rating" id=(format!("rating{}", i)) value=(rating.to_lowercase());
                                    label.cursor-pointer.grayscale.hover:grayscale-0.transition-all.duration-200
                                        for=(format!("rating{}", i)) { (ratings_emoji[i]) }
                                }
                            }
                        }

                        // Date (hidden on mobile)
                        div.space-y-2.hidden.md:block {
                            div.flex.items-center.justify-between {
                                label.text-sm.font-medium.text-gray-700 for="date-desktop" { "Finished Date" }
                                label.flex.items-center.gap-2.text-xs.text-gray-600 {
                                    input.rounded type="checkbox" id="no-date-desktop" name="no-date" checked;
                                    span { "Set" }
                                }
                            }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="date" name="date" id="date-desktop" required value=(chrono::Local::now().format("%Y-%m-%d"));
                        }

                        // Source ID (hidden on mobile)
                        div.space-y-2.hidden.md:block {
                            label.block.text-sm.font-medium.text-gray-700 for="source-id" { "Source ID" }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.bg-gray-50.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="text" id="source-id" name="source-id" placeholder="Auto-filled" required;
                        }

                        // Platform (hidden on mobile)
                        div #platform.hidden.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="platform-select" { "Platform" }
                            select.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                name="platform-select" id="platform-select" {}
                        }

                        // Password (hidden on mobile)
                        div.space-y-2.hidden.md:block {
                            label.block.text-sm.font-medium.text-gray-700 for="form_password-desktop" { "Password" }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="password" name="form_password" placeholder="Confirm" required;
                        }

                        // Submit (hidden on mobile)
                        button.w-full.bg-blue-600.hover:bg-blue-700.text-white.font-medium.py-2.px-4.rounded-md.transition-colors.hidden.md:block
                            type="submit" { "Submit" }
                    }

                    // Bottom fields on mobile only (after editor)
                    aside.order-3.md:hidden.space-y-6 {
                        // Date
                        div.space-y-2 {
                            div.flex.items-center.justify-between {
                                label.text-sm.font-medium.text-gray-700 for="date" { "Finished Date" }
                                label.flex.items-center.gap-2.text-xs.text-gray-600 {
                                    input.rounded type="checkbox" id="no-date" name="no-date" checked;
                                    span { "Set" }
                                }
                            }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="date" name="date" id="date" required value=(chrono::Local::now().format("%Y-%m-%d"));
                        }

                        // Source ID
                        div.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="source-id-mobile" { "Source ID" }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.bg-gray-50.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="text" id="source-id-mobile" name="source-id" placeholder="Auto-filled" required;
                        }

                        // Platform
                        div #platform-mobile.hidden.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="platform-select-mobile" { "Platform" }
                            select.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                name="platform-select" id="platform-select-mobile" {}
                        }

                        // Password
                        div.space-y-2 {
                            label.block.text-sm.font-medium.text-gray-700 for="form_password" { "Password" }
                            input.w-full.px-3.py-2.border.border-gray-300.rounded-md.focus:outline-none.focus:ring-2.focus:ring-blue-500
                                type="password" name="form_password" placeholder="Confirm" required;
                        }

                        // Submit
                        button.w-full.bg-blue-600.hover:bg-blue-700.text-white.font-medium.py-2.px-4.rounded-md.transition-colors
                            type="submit" { "Submit" }
                    }
                }
            }

            script type="module" src="/assets/catalogue/add-form.js" {}
            script type="module" {
                (script_content)
            }
        },
    )
}

#[derive(Debug, Deserialize)]
struct ProxyQuery {
    r#type: String,
    query: String,
}

async fn catalogue_proxy_handler(
    Query(params): Query<ProxyQuery>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let source = headers
        .get("x-proxy-source")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    let client = reqwest::Client::new();

    match source {
        "tmdb" => {
            let tmdb_key =
                std::env::var("TMDB_KEY").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            let response = client
                .get(format!(
                    "https://api.themoviedb.org/3/search/{}?query={}&api_key={}",
                    params.r#type, params.query, tmdb_key
                ))
                .send()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let body = response.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

            Ok((
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                body,
            )
                .into_response())
        }
        "igdb" => {
            let igdb_key =
                std::env::var("IGDB_KEY").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let igdb_client =
                std::env::var("IGDB_CLIENT").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Get access token
            let token_response = client
                .post(format!(
                    "https://id.twitch.tv/oauth2/token?client_id={}&client_secret={}&grant_type=client_credentials",
                    igdb_client, igdb_key
                ))
                .send()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let token_data: HashMap<String, serde_json::Value> = token_response
                .json()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let access_token = token_data
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or(StatusCode::BAD_GATEWAY)?;

            // Search games
            let response = client
                .post("https://api.igdb.com/v4/games")
                .header("Accept", "application/json")
                .header("Client-ID", &igdb_client)
                .header("Authorization", format!("Bearer {}", access_token))
                .body(format!(
                    "fields name,cover.url,id; search \"{}\";",
                    params.query
                ))
                .send()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let body = response.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

            Ok((
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                body,
            )
                .into_response())
        }
        "isbn" => {
            let response = client
                .get(format!(
                    "https://openlibrary.org/search.json?title={}&fields=key,title,isbn,cover_i,editions,editions.isbn",
                    params.query.replace(" ", "+")
                ))
                .send()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let body = response.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

            Ok((
                StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                body,
            )
                .into_response())
        }
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

async fn check_if_file_exists(
    client: &reqwest::Client,
    token: &str,
    repo: &str,
    path_type: &str,
    slug: &str,
) -> bool {
    let response = client
        .get(format!(
            "https://api.github.com/repos/{}/contents/crates/website/content/{}/{}/{}.md",
            repo, path_type, slug, slug
        ))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "erika-florist-backend")
        .header("Authorization", format!("Bearer {}", token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await;

    match response {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

async fn post_to_github(
    client: &reqwest::Client,
    token: &str,
    repo: &str,
    path: &str,
    content: &str,
    title: &str,
) -> Result<String, String> {
    let b64_content = general_purpose::STANDARD.encode(content);

    let body = GitHubRequest {
        message: format!("content(catalogue): Add {} [auto]", title),
        content: b64_content,
        committer: GitHubCommitter {
            name: "Princesseuh".to_string(),
            email: "3019731+Princesseuh@users.noreply.github.com".to_string(),
        },
    };

    let response = client
        .put(format!(
            "https://api.github.com/repos/{}/contents/crates/website/content/{}",
            repo, path
        ))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "erika-florist-backend")
        .header("Authorization", format!("Bearer {}", token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("GitHub API error: {}", error_text));
    }

    let response_json: HashMap<String, serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    response_json
        .get("commit")
        .and_then(|commit| commit.get("html_url"))
        .and_then(|url| url.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "No commit URL in response".to_string())
}
