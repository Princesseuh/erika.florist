use axum::{
    Router,
    extract::{Path, State},
    routing::get,
};
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

    let mut content = content_sources("../website".to_owned());

    content.init_all();

    let shared_content = Arc::new(content);

    // build our application with a route
    let app = Router::new()
        .route("/", get(index))
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
                toolbar: true
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
