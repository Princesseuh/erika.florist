use std::hash::{DefaultHasher, Hash, Hasher};

use maud::{PreEscaped, html};
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
                // Floating filter button for mobile
                button id="mobile-filter-toggle" ."sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-accent-valencia text-white-sugar-cane rounded-full p-0 flex items-center justify-center shadow-lg hover:bg-accent-valencia/90 focus:outline-none focus:ring-2 focus:ring-accent-valencia focus:ring-offset-2" aria-label="Toggle filters" {
                    svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                        path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4";
                    }
                }

                // Mobile sidebar overlay
                div id="mobile-filter-sidebar" ."sm:hidden fixed inset-0 bg-black/50 z-50 opacity-0 pointer-events-none" {
                    div."absolute right-0 top-0 h-full w-80 max-w-sm bg-white-sugar-cane overflow-y-auto transform translate-x-full transition-transform" {
                        div."p-6 pt-12" {
                            button id="mobile-filter-close" ."absolute top-4 right-4 text-black-charcoal hover:text-accent-valencia" aria-label="Close filters" {
                                svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                                    path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12";
                                }
                            }
                            // Mobile filters (same as desktop)
                            div id="catalogue-filters" class="flex flex-col gap-6" {
                                div class="flex flex-col gap-2" {
                                    label for="mobile-catalogue-search" class="font-bold text-sm" { "Search" }
                                    input id="mobile-catalogue-search" type="search";
                                }

                                div class="flex flex-col gap-2" {
                                    label for="mobile-catalogue-types" class="font-bold text-sm" { "Type" }
                                    select name="types" id="mobile-catalogue-types" {
                                        option value="" { "Type" }
                                        option value="book" { "Book" }
                                        option value="game" { "Game" }
                                        option value="movie" { "Movie" }
                                        option value="show" { "Show" }
                                    }
                                }

                                div class="flex flex-col gap-2" {
                                    label for="mobile-catalogue-ratings" class="font-bold text-sm" { "Rating" }
                                    select name="ratings" id="mobile-catalogue-ratings" {
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
                                    label for="mobile-catalogue-sort" class="mb-1 flex items-center justify-between gap-x-2 font-bold text-sm" { "Sort" input id="mobile-catalogue-sort-ord" type="checkbox" class="m-0 cursor-pointer appearance-none text-lg before:text-rose-ebony before:content-['↑'] checked:before:content-['↓'] sm:text-base h-full w-auto"; }
                                    select name="sort" id="mobile-catalogue-sort" {
                                        option value="date" { "Date" }
                                        option value="rating" { "Rating" }
                                        option value="alphabetical" { "Title" }
                                    }
                                }
                            }
                            div id="catalogue-entry-count" class="mt-4" { "... entries" }
                        }
                    }
                }

                article.mx-4.my-4 {
                    p class="sm:hidden text-sm mb-4" { "This page lists games, books, shows… stuff I've played, watched, read, or listened to."}

                    div.flex.relative id="catalogue-core" data-pagelength=(page_length) data-latest=(catalogue_hash) {
                        aside class="hidden sm:block grow-0 sm:my-4 px-4 pr-8 w-64" {
                            p class="text-sm mb-4" { "This page lists games, books, shows… stuff I've played, watched, read, or listened to."}
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
                                    label for="catalogue-sort" class="mb-1 flex items-center justify-between gap-x-2" { "Sort" input id="catalogue-sort-ord" type="checkbox" class="m-0 cursor-pointer appearance-none text-lg before:text-rose-ebony before:content-['↑'] checked:before:content-['↓'] sm:text-base h-full w-auto"; }
                                    select name="sort" id="catalogue-sort" {
                                        option value="date" { "Date" }
                                        option value="rating" { "Rating" }
                                        option value="alphabetical" { "Title" }
                                    }
                                }
                            }
                            div id="catalogue-entry-count" class="mt-4" { "... entries" }
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

                (PreEscaped(r#"<script>
                    document.addEventListener('DOMContentLoaded', () => {
                        const filterToggle = document.getElementById('mobile-filter-toggle');
                        const filterSidebar = document.getElementById('mobile-filter-sidebar');
                        const filterClose = document.getElementById('mobile-filter-close');
                        let filterOpen = false;

                        function toggleFilterSidebar() {
                            filterOpen = !filterOpen;
                            if (filterSidebar) {
                                filterSidebar.classList.toggle('opacity-0', !filterOpen);
                                filterSidebar.classList.toggle('opacity-100', filterOpen);
                                filterSidebar.classList.toggle('pointer-events-none', !filterOpen);
                                const content = filterSidebar.querySelector('div > div');
                                if (content) {
                                    content.classList.toggle('translate-x-full', !filterOpen);
                                    content.classList.toggle('translate-x-0', filterOpen);
                                }
                            }
                            document.body.style.overflow = filterOpen ? 'hidden' : '';
                        }

                        if (filterToggle) filterToggle.addEventListener('click', toggleFilterSidebar);
                        if (filterClose) filterClose.addEventListener('click', toggleFilterSidebar);
                        if (filterSidebar) {
                            filterSidebar.addEventListener('click', (e) => {
                                if (e.target === filterSidebar) toggleFilterSidebar();
                            });
                        }
                    });
                </script>"#))
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
