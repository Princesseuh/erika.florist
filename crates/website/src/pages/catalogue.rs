use std::hash::{DefaultHasher, Hash, Hasher};

use maud::html;
use maudit::route::prelude::*;

use crate::components::catalogue::{SidebarConfig, catalogue_filters};
use crate::components::icon::Icon;
use crate::components::mobile_menu;
use crate::content::Status;
use crate::{content::CatalogueMetadata, layouts::base_layout, state};

fn catalogue_sidebar(prefix: &str, mobile: bool) -> maud::Markup {
    catalogue_filters(&SidebarConfig {
        prefix,
        mobile,
        show_type: true,
        show_status: true,
        show_rating: true,
        show_completion: false,
        show_date_range: true,
        show_collection: false,
        default_status: "finished",
        sort_options: &[
            ("date", "Date"),
            ("release", "Release"),
            ("rating", "Rating"),
            ("alphabetical", "Title"),
        ],
        count_id: "catalogue-entry-count",
        count_label: "... entries",
    })
}

fn catalogue_mobile_filters() -> maud::Markup {
    html!(
        div class="flex gap-x-2 mb-4" {
            a."button-style-bg-accent block w-full text-center" href="/catalogue/collections/" { "Collections" }
            a."button-style-bg-accent block w-full text-center" href="/catalogue/stats/" { "Stats" }
        }
        (catalogue_sidebar("mobile-catalogue", true))
    )
}

#[route("/catalogue/")]
pub struct Catalogue;

impl Route for Catalogue {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/catalogue.ts")?;
        ctx.assets.include_script("src/assets/catalogue-add.ts")?;
        let page_length = 32;

        // Empty on incremental rebuilds where CatalogueContent stayed cached (hash unset);
        // catalogue.ts then just refetches content.json instead of panicking here.
        let catalogue_hash = state::get_catalogue_hash().unwrap_or_default();

        Ok(base_layout(
            Some("Catalogue".into()),
            None,
            html!(
                (mobile_menu("catalogue", catalogue_mobile_filters(), Icon::Search))

                article.mx-4.my-4 {
                    p class="sm:hidden text-sm mb-4" { "This page lists games, books, shows… stuff I've played, watched, read, or listened to."}

                    div.flex.relative id="catalogue-core" data-pagelength=(page_length) data-latest=(catalogue_hash) {
                        aside class="hidden sm:block grow-0 sm:my-4 px-4 pr-8 w-64" {
                            p class="text-sm mb-4" { "This page lists games, books, shows… stuff I've played, watched, read, or listened to."}
                            div class="flex gap-x-2 mb-4" {
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/collections/" { "Collections" }
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/stats/" { "Stats" }
                            }
                            div class="sticky top-4" {
                                (catalogue_sidebar("catalogue", false))
                        }
                    }
                        div.flex-1 {
                            div class="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] md:grid-cols-[repeat(auto-fit,180px)] justify-center gap-2" id="catalogue-content" {
                                @for _ in 0..page_length {
                                    div class="w-full" {
                                        div class="aspect-[3/4.3] h-auto animate-pulse bg-neutral-900/30" {}
                                    }
                                }
                            }

                            (crate::components::catalogue::add_entry_button())
                        }
                    }

                        (crate::components::catalogue::review_modal())

                        (crate::components::catalogue::add_entry_modal())
                }

            ),
            true,
            Some("scrollbar-gutter-stable"),
            ctx,
        ))
    }
}

#[route("/catalogue/content.json")]
pub struct CatalogueContent;

impl Route for CatalogueContent {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let games: Vec<_> = ctx
            .content::<crate::content::CatalogueGame>("games")
            .entries()
            .collect();
        let movies: Vec<_> = ctx
            .content::<crate::content::CatalogueMovie>("movies")
            .entries()
            .collect();
        let books: Vec<_> = ctx
            .content::<crate::content::CatalogueBook>("books")
            .entries()
            .collect();
        let shows: Vec<_> = ctx
            .content::<crate::content::CatalogueShow>("shows")
            .entries()
            .collect();

        // Pre-calculate total capacity to avoid reallocations
        let total_capacity = games.len() + movies.len() + books.len() + shows.len();
        let mut entries_data = Vec::with_capacity(total_capacity);

        // Helper macro to reduce code duplication
        macro_rules! add_entries {
            ($entries:expr, $type_id:expr) => {
                for item in $entries {
                    let data = item.data(ctx);
                    let rendered_content = item.render(ctx);
                    let (cover_url, placeholder) = &data.cover;

                    let mut entry = Vec::with_capacity(13);
                    entry.push(serde_json::Value::String(cover_url.clone()));
                    entry.push(serde_json::Value::String(placeholder.clone()));
                    entry.push(serde_json::Value::Number(serde_json::Number::from(
                        $type_id,
                    )));
                    entry.push(serde_json::Value::String(data.title.clone()));
                    match data.get_rating() {
                        Some(r) => entry.push(serde_json::Value::Number(serde_json::Number::from(
                            r.to_number(),
                        ))),
                        None => entry.push(serde_json::Value::Null),
                    }
                    entry.push(serde_json::Value::String(
                        data.get_author().unwrap_or_default(),
                    ));

                    if let Some(date) = &data.finished_date {
                        entry.push(serde_json::Value::Number(serde_json::Number::from(
                            date.and_hms_opt(0, 0, 0)
                                .unwrap()
                                .and_utc()
                                .timestamp_millis(),
                        )));
                    } else {
                        entry.push(serde_json::Value::Null);
                    }

                    match data.get_release_year() {
                        Some(year) => {
                            entry.push(serde_json::Value::Number(serde_json::Number::from(year)))
                        }
                        None => entry.push(serde_json::Value::Null),
                    }

                    entry.push(serde_json::Value::String(rendered_content));

                    let status_num = match data.get_status() {
                        Status::Finished => 0,
                        Status::Planned => 1,
                    };
                    entry.push(serde_json::Value::Number(serde_json::Number::from(
                        status_num,
                    )));

                    entry.push(serde_json::Value::String(item.id.clone()));

                    entry.push(serde_json::Value::Array(
                        data.get_genres()
                            .into_iter()
                            .map(serde_json::Value::String)
                            .collect(),
                    ));

                    match data.get_runtime() {
                        Some(runtime) => {
                            entry.push(serde_json::Value::Number(serde_json::Number::from(runtime)))
                        }
                        None => entry.push(serde_json::Value::Null),
                    }

                    entries_data.push(entry);
                }
            };
        }

        add_entries!(games, 0);
        add_entries!(movies, 1);
        add_entries!(shows, 2);
        add_entries!(books, 3);

        let collections_index = crate::pages::collection::build_collections_index(ctx);

        let mut hasher = DefaultHasher::new();
        entries_data.hash(&mut hasher);
        collections_index.hash(&mut hasher);
        let hash = format!("{:x}", hasher.finish());

        let _ = state::set_catalogue_hash(hash.clone());

        let result = serde_json::json!([hash, entries_data, collections_index]);

        result.to_string()
    }
}

#[route("/catalogue/mcp.json")]
pub struct CatalogueMCP;

fn strip_frontmatter(raw: &str) -> String {
    let trimmed = raw.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            return rest[end + 5..].trim_start().to_string();
        }
        if let Some(end) = rest.find("\n---") {
            return rest[end + 4..].trim_start().to_string();
        }
    }
    trimmed.to_string()
}

impl Route for CatalogueMCP {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        use serde_json::json;

        let mut entries: Vec<serde_json::Value> = Vec::new();

        let games: Vec<_> = ctx
            .content::<crate::content::CatalogueGame>("games")
            .entries()
            .collect();
        for item in games {
            let content = strip_frontmatter(&item.raw_content.clone().unwrap_or_default());
            let data = item.data(ctx);
            let meta = data.get_metadata();
            entries.push(json!({
                "id": item.id,
                "type": "game",
                "title": data.title,
                "igdb_id": data.igdb.parse::<u64>().ok(),
                "status": data.get_status(),
                "rating": data.rating.as_ref().map(|r| r.to_string()),
                "rating_number": data.rating.as_ref().map(|r| r.to_number()),
                "finished_date": data.finished_date.map(|d| d.format("%Y-%m-%d").to_string()),
                "release_year": data.get_release_year(),
                "author": data.get_author(),
                "genres": meta.genres.iter().map(|g| g.name.clone()).collect::<Vec<_>>(),
                "platforms": meta.platforms.iter().map(|p| p.abbreviation.clone()).collect::<Vec<_>>(),
                "content": content,
            }));
        }

        let movies: Vec<_> = ctx
            .content::<crate::content::CatalogueMovie>("movies")
            .entries()
            .collect();
        for item in movies {
            let content = strip_frontmatter(&item.raw_content.clone().unwrap_or_default());
            let data = item.data(ctx);
            let meta = data.get_metadata();
            entries.push(json!({
                "id": item.id,
                "type": "movie",
                "title": data.title,
                "tmdb_id": meta.id,
                "status": data.get_status(),
                "rating": data.rating.as_ref().map(|r| r.to_string()),
                "rating_number": data.rating.as_ref().map(|r| r.to_number()),
                "finished_date": data.finished_date.map(|d| d.format("%Y-%m-%d").to_string()),
                "release_year": data.get_release_year(),
                "author": data.get_author(),
                "genres": meta.genres,
                "runtime_minutes": meta.runtime,
                "overview": meta.overview,
                "tagline": meta.tagline,
                "content": content,
            }));
        }

        let shows: Vec<_> = ctx
            .content::<crate::content::CatalogueShow>("shows")
            .entries()
            .collect();
        for item in shows {
            let content = strip_frontmatter(&item.raw_content.clone().unwrap_or_default());
            let data = item.data(ctx);
            let meta = data.get_metadata();
            entries.push(json!({
                "id": item.id,
                "type": "show",
                "title": data.title,
                "tmdb_id": meta.id,
                "status": data.get_status(),
                "rating": data.rating.as_ref().map(|r| r.to_string()),
                "rating_number": data.rating.as_ref().map(|r| r.to_number()),
                "finished_date": data.finished_date.map(|d| d.format("%Y-%m-%d").to_string()),
                "release_year": data.get_release_year(),
                "author": data.get_author(),
                "genres": meta.genres,
                "overview": meta.overview,
                "tagline": meta.tagline,
                "content": content,
            }));
        }

        let books: Vec<_> = ctx
            .content::<crate::content::CatalogueBook>("books")
            .entries()
            .collect();
        for item in books {
            let content = strip_frontmatter(&item.raw_content.clone().unwrap_or_default());
            let data = item.data(ctx);
            let meta = data.get_metadata();
            entries.push(json!({
                "id": item.id,
                "type": "book",
                "title": data.title,
                "isbn": data.isbn,
                "status": data.get_status(),
                "rating": data.rating.as_ref().map(|r| r.to_string()),
                "rating_number": data.rating.as_ref().map(|r| r.to_number()),
                "finished_date": data.finished_date.map(|d| d.format("%Y-%m-%d").to_string()),
                "release_year": data.get_release_year(),
                "author": data.get_author(),
                "authors": meta.authors,
                "publishers": meta.publishers,
                "pages": meta.pages,
                "content": content,
            }));
        }

        json!({
            "version": 2,
            "entries": serde_json::Value::Array(entries),
        })
        .to_string()
    }
}
