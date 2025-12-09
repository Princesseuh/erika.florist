use std::hash::{DefaultHasher, Hash, Hasher};

use maud::html;
use maudit::route::prelude::*;

use crate::{content::CatalogueMetadata, layouts::base_layout, state};

#[route("/catalogue")]
pub struct Catalogue;

impl Route for Catalogue {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/catalogue.ts")?;
        let page_length = 32;

        let catalogue_hash = state::get_catalogue_hash().unwrap();

        Ok(base_layout(
            Some("Catalogue".into()),
            None,
            html!(
                article.mx-4.my-4 {
                    div.flex.relative id="catalogue-core" data-pagelength=(page_length) data-latest=(catalogue_hash) {
                        aside class="grow-0 sm:my-4 px-4 pr-8 w-64" {
                            p class="text-sm mb-4" { "This page lists games, books, shows… stuff I've played, watched, read, listened to."}
                            div class="sticky top-4" {
                                div id="catalogue-filters" class="flex flex-col gap-y-2" {
                                div {
                                    label for="catalogue-search" { "Search" }
                                    input id="catalogue-search" type="search";
                                }

                                div {
                                    label for="catalogue-types" { "Type" }
                                    select name="types" id="catalogue-types" {
                                        option value="" { "Type" }
                                        option value="book" { "Book" }
                                        option value="game" { "Game" }
                                        option value="movie" { "Movie" }
                                        option value="show" { "Show" }
                                    }
                                }

                                div {
                                    label for="catalogue-ratings" { "Rating" }
                                    select name="ratings" id="catalogue-ratings" {
                                        option value="" { "Rating" }
                                        option value="5" { "Masterpiece" }
                                        option value="4" { "Loved" }
                                        option value="3" { "Liked" }
                                        option value="2" { "Okay" }
                                        option value="1" { "Disliked" }
                                        option value="0" { "Hated" }
                                    }
                                }

                                div {
                                    label for="catalogue-sort" class="mb-1 flex items-center justify-between gap-x-2" { "Sort" input id="catalogue-sort-ord" type="checkbox" class="m-0 cursor-pointer appearance-none text-lg before:text-rose-ebony before:content-['↑'] checked:before:content-['↓'] dark:before:text-white sm:text-base h-full w-auto"; }
                                    select name="sort" id="catalogue-sort" {
                                        option value="date" { "Date" }
                                        option value="rating" { "Rating" }
                                        option value="alphabetical" { "Title" }
                                    }
                                }
                            }
                            div id="catalogue-entry-count" class="" { "... entries" }
                        }
                    }
                        div.flex-1 {
                            div.grid."grid-cols-[repeat(auto-fit,180px)]".gap-2 id="catalogue-content" {
                                @for _ in 0..page_length {
                                    div class="w-[180px]" {
                                        div class="aspect-[3/4.3] h-auto animate-pulse bg-neutral-900/30" {}
                                    }
                                }
                            }
                        }
                    }
                }
            ),
            true,
            ctx,
        ))
    }
}

#[route("/catalogue/content.json")]
pub struct CatalogueContent;

impl Route for CatalogueContent {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let games = &ctx
            .content
            .get_source::<crate::content::CatalogueGame>("games")
            .entries;
        let movies = &ctx
            .content
            .get_source::<crate::content::CatalogueMovie>("movies")
            .entries;
        let books = &ctx
            .content
            .get_source::<crate::content::CatalogueBook>("books")
            .entries;
        let shows = &ctx
            .content
            .get_source::<crate::content::CatalogueShow>("shows")
            .entries;

        // Pre-calculate total capacity to avoid reallocations
        let total_capacity = games.len() + movies.len() + books.len() + shows.len();
        let mut entries_data = Vec::with_capacity(total_capacity);

        // Helper macro to reduce code duplication
        macro_rules! add_entries {
            ($entries:expr, $type_id:expr) => {
                for item in $entries {
                    let data = item.data(ctx);
                    let (cover_url, placeholder) = &data.cover;

                    // Pre-allocate with known capacity (6-7 elements)
                    let mut entry = Vec::with_capacity(7);
                    entry.push(serde_json::Value::String(cover_url.clone()));
                    entry.push(serde_json::Value::String(placeholder.clone()));
                    entry.push(serde_json::Value::Number(serde_json::Number::from(
                        $type_id,
                    )));
                    entry.push(serde_json::Value::String(data.title.clone()));
                    entry.push(serde_json::Value::Number(serde_json::Number::from(
                        data.rating.to_number(),
                    )));
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
                    }
                    entries_data.push(entry);
                }
            };
        }

        add_entries!(games, 0);
        add_entries!(movies, 1);
        add_entries!(shows, 2);
        add_entries!(books, 3);

        let mut hasher = DefaultHasher::new();
        entries_data.hash(&mut hasher);
        let hash = format!("{:x}", hasher.finish());

        // Store the hash in global state (ignore errors if already set)
        let _ = state::set_catalogue_hash(hash.clone());

        // Use serde_json::json! macro for cleaner syntax
        let result = serde_json::json!([hash, entries_data]);

        result.to_string()
    }
}
