use axum::{
    Router,
    extract::{Path, State},
    routing::get,
};
use erikaflorist::content::{BlogPost, ContentSources, Project, WikiEntry, content_sources};
use maud::{Markup, html};
use maudit::{
    assets::{RouteAssets, RouteAssetsOptions},
    route::PageContext,
};
use std::sync::Arc;
use tower_http::services::ServeDir;

mod templates;

#[derive(Debug, Clone)]
struct EntryDisplay {
    id: String,
    title: String,
    description: Option<String>,
    date: Option<String>,
}

#[tokio::main]
async fn main() {
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

fn get_entries_for_source(content: &ContentSources, source: &str) -> Vec<EntryDisplay> {
    let mut assets = RouteAssets::new(&RouteAssetsOptions::default(), None);
    let mut ctx = PageContext {
        content,
        current_path: &String::new(),
        params: &(),
        props: &(),
        assets: &mut assets,
        base_url: &None,
    };

    match source {
        "blog" => {
            let blog_source = content.get_source::<BlogPost>("blog");

            let mut sorted_entries = blog_source.entries.clone();

            // Sort by date in descending order (newest first)
            sorted_entries.sort_by(|a, b| {
                let a_date = a.data(&mut ctx).date;
                let b_date = b.data(&mut ctx).date;
                b_date.cmp(&a_date)
            });

            // Map to EntryDisplay
            sorted_entries
                .iter()
                .map(|entry| {
                    let data = entry.data(&mut ctx);
                    EntryDisplay {
                        id: entry.id.clone(),
                        title: data.title.clone(),
                        description: data.tagline.clone(),
                        date: Some(data.date.format("%B %d, %Y").to_string()),
                    }
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

fn render_entries_list(entries: &[EntryDisplay], source: &str) -> Markup {
    html! {
        div.bg-white {
            @if entries.is_empty() {
                div.flex.items-center.justify-center.h-64 {
                    p.text-gray-500 { "No entries found." }
                }
            } @else {
                @for entry in entries {
                    a.block.px-4.py-3.border-b.border-gray-200.hover:bg-gray-50.transition-colors.duration-150.cursor-pointer.text-decoration-none href=(format!("/{}/{}", source, entry.id)) {
                        div.flex.items-center.justify-between {
                            div.flex-1.min-w-0 {
                                h3.text-sm.font-medium.text-gray-900.truncate {
                                    (entry.title)
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
        }
    }
}

async fn entry_handler(
    State(content): State<Arc<ContentSources>>,
    Path((source, entry_id)): Path<(String, String)>,
) -> Markup {
    let entry_content = match source.as_str() {
        "blog" => {
            let blog_source = content.get_source::<BlogPost>("blog");
            blog_source
                .get_entry(&entry_id)
                .raw_content
                .as_ref()
                .unwrap()
        }
        "wiki" => {
            let wiki_source = content.get_source::<WikiEntry>("wiki");
            wiki_source
                .get_entry(&entry_id)
                .raw_content
                .as_ref()
                .unwrap()
        }
        "projects" => {
            let projects_source = content.get_source::<Project>("projects");
            projects_source
                .get_entry(&entry_id)
                .raw_content
                .as_ref()
                .unwrap()
        }
        _ => &"Source not found".to_string(),
    };

    templates::base_template(
        content.as_ref(),
        html! {
            div {
                h1.text-3xl.font-bold.text-gray-900.mb-6 {
                    (format!("{}: {}", source, entry_id))
                }
                pre.bg-gray-50.p-4.rounded.overflow-auto.text-sm {
                    (entry_content)
                }
            }
        },
    )
}

async fn catalogue_handler(
    State(content): State<Arc<ContentSources>>,
    source: &'static str,
) -> Markup {
    templates::base_template(
        content.as_ref(),
        html! {
            h1 { "Catalogue: " (source) }
            p { "This is a placeholder for the " (source) " catalogue." }
        },
    )
}
