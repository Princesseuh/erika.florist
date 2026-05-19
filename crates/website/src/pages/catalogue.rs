use std::hash::{DefaultHasher, Hash, Hasher};

use maud::html;
use maudit::route::prelude::*;

use crate::components::icon::Icon;
use crate::components::mobile_menu;
use crate::content::Status;
use crate::{content::CatalogueMetadata, layouts::base_layout, state};

fn catalogue_mobile_filters() -> maud::Markup {
    html! {
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
                label for="mobile-catalogue-status" class="font-bold text-sm" { "Status" }
                select name="status" id="mobile-catalogue-status" {
                    option value="finished" selected { "Finished" }
                    option value="planned" { "Planned" }
                    option value="all" { "All" }
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

#[route("/catalogue/")]
pub struct Catalogue;

impl Route for Catalogue {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/catalogue.ts")?;
        ctx.assets.include_script("src/assets/catalogue-add.ts")?;
        let page_length = 32;

        let catalogue_hash = state::get_catalogue_hash().unwrap();

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
                                    label for="catalogue-status" { "Status" }
                                    select name="status" id="catalogue-status" {
                                        option value="finished" selected { "Finished" }
                                        option value="planned" { "Planned" }
                                        option value="all" { "All" }
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
                            div.grid."grid-cols-[repeat(auto-fit,180px)]".justify-center.gap-2 id="catalogue-content" {
                                @for _ in 0..page_length {
                                    div class="w-[180px]" {
                                        div class="aspect-[3/4.3] h-auto animate-pulse bg-neutral-900/30" {}
                                    }
                                }
                            }

                            button id="add-entry-btn" class="hidden fixed bottom-22 md:bottom-8 right-6 w-14 h-14 rounded-full bg-accent-valencia text-white text-2xl shadow-lg hover:bg-accent-valencia/80 transition-colors z-40" title="Add entry" {
                                "+"
                            }
                        }
                    }

                        div id="review-modal" class="hidden fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" {
                            div class="bg-white-sugar-cane rounded-t-lg sm:rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col sm:max-h-[85vh]" {
                                div id="review-modal-header" class="bg-accent-valencia px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center rounded-t-lg shrink-0" {
                                    h2 id="review-modal-title" class="text-lg sm:text-xl font-bold text-white m-0" {
                                        a id="review-modal-title-link" class="text-white underline-offset-2 hover:underline decoration-white" href="" {}
                                    }
                                    button id="close-review-modal" class="text-white hover:text-black text-2xl font-bold leading-none" { "×" }
                                }
                                div class="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 overflow-y-auto" {
                                    img id="review-modal-cover" class="hidden w-full sm:w-[120px] max-h-48 sm:max-h-none shrink-0 object-contain sm:object-cover rounded self-start" src="" alt="" {}
                                    div class="flex flex-col gap-3 min-w-0" {
                                        div id="review-modal-meta" class="flex flex-col gap-y-0.5 text-sm text-subtle-charcoal" {}
                                        div id="review-modal-content" class="prose text-black" {}
                                    }
                                }
                            }
                        }

                        div id="add-entry-modal" class="hidden fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" {
                        div class="bg-white-sugar-cane rounded-t-lg sm:rounded-lg max-w-2xl w-full max-h-[95vh] flex flex-col" {
                            div class="bg-accent-valencia px-6 py-4 flex justify-between items-center rounded-t-lg shrink-0" {
                                h2 id="add-modal-title" class="text-xl font-bold text-white" { "Add catalogue entry" }
                                button id="close-modal" class="text-white hover:text-black text-2xl font-bold" { "×" }
                            }

                            div id="modal-mode-toggle" class="flex bg-zinc-200 text-black border-b-2 border-black shrink-0" {
                                button type="button" data-mode="finished" class="modal-mode-btn flex-1 py-2 font-bold bg-white-sugar-cane" { "Finished" }
                                button type="button" data-mode="planned" class="modal-mode-btn flex-1 py-2 font-bold" { "Planned" }
                            }

                            div id="queue-section" class="hidden p-4 border-b-2 border-black shrink-0 text-black" {
                                div class="font-bold text-sm mb-2" { "Queue (" span id="queue-count" { "0" } ")" }
                                ul id="queue-items" class="space-y-1 text-sm max-h-32 overflow-y-auto" {}
                            }

                            div class="p-6 overflow-y-auto" {
                                form id="add-entry-form" class="space-y-4 text-black" {
                                    div id="selected-result" class="flex justify-center items-center gap-2" {
                                        img id="selected-cover" class="w-12 h-16 object-cover rounded hidden" src="" {};
                                        div id="selected-cover-placeholder" class="w-12 h-16 bg-zinc-300 rounded" {}
                                        span id="selected-title" class="font-medium" { "No selection" }
                                        input type="hidden" id="entry-source-id" name="source-id";
                                        input type="hidden" id="entry-promote-slug" name="promote-slug";
                                    }

                                    div id="type-title-row" class="flex items-end" {
                                        label class="w-1/4 md:w-[15%]" {
                                            span class="block text-sm font-bold mb-1" { "Type" }
                                            select id="entry-type" name="type" class="w-full px-3 py-2 bg-white border-y-2 border-l-2 border-black rounded-l rounded-r-none font-medium h-10 disabled:bg-zinc-400" required {
                                                option value="" { "Select" }
                                                option value="game" { "Game" }
                                                option value="movie" { "Movie" }
                                                option value="tv" { "Show" }
                                                option value="book" { "Book" }
                                            }
                                        }
                                        label class="flex-1" {
                                            span class="block text-sm font-bold mb-1" { "Title" }
                                            div class="relative" {
                                                input id="entry-name" name="name" class="w-full px-3 py-2 bg-white border-2 border-black rounded-r font-medium h-10 disabled:bg-zinc-400 disabled:cursor-not-allowed" placeholder="Select type first..." disabled;
                                                div id="entry-search-spinner" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" {}
                                            }
                                        }
                                    }

                                    div class="relative" {
                                        div id="search-results" class="mt-2 max-h-40 overflow-y-auto hidden border-2 border-black bg-white absolute z-10 left-0 right-0" {}
                                    }

                                    div id="rating-row" class="block" {
                                        span class="block text-sm font-bold mb-2 block" { "Rating" }
                                        div id="rating-options" class="flex justify-center gap-4" {
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="hated" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "🙁" }
                                            }
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="disliked" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "😕" }
                                            }
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="okay" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "😐" }
                                            }
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="liked" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "🙂" }
                                            }
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="loved" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "🥰" }
                                            }
                                            label class="cursor-pointer flex flex-col items-center" {
                                                input type="radio" name="rating" value="masterpiece" class="peer sr-only";
                                                span class="text-3xl peer-checked:scale-125 transition-transform" { "❤️" }
                                            }
                                        }
                                    }

                                    div id="date-row" {
                                        label {
                                            span class="block text-sm font-bold mb-1" { "Date finished" }
                                            input type="date" id="entry-date" name="date" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium";
                                        }
                                    }

                                    div id="comment-row" {
                                        label {
                                            span class="block text-sm font-bold mb-1" { "Comment" }
                                            textarea id="entry-comment" name="comment" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium h-24" placeholder="Thoughts..." {}
                                        }
                                    }

                                    div class="flex items-center justify-between" {
                                        div class="flex items-center gap-2" {
                                            input type="checkbox" id="skip-ci" name="skip-ci" value="skip-ci";
                                            label for="skip-ci" class="text-sm font-bold" { "Skip CI/CD" }
                                        }
                                        input type="text" id="entry-source-id-display" class="px-2 py-1 border-2 border-black rounded font-medium text-sm w-32" placeholder="Source ID" {};
                                    }

                                    div id="form-error" class="hidden bg-red-100 border-2 border-red-600 text-red-600 px-4 py-3 rounded font-bold" {}

                                    div {
                                        label class="block text-sm font-bold mb-1" for="form-password" { "Password" }
                                        input type="password" id="form-password" name="form-password" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium" required;
                                    }

                                    div class="flex gap-2" {
                                        button type="button" id="add-to-queue-btn" class="flex-1 bg-zinc-300 text-black py-3 rounded font-bold hover:bg-zinc-400" { "+ Add to queue" }
                                        button type="submit" id="submit-btn" class="flex-1 bg-accent-valencia text-white py-3 rounded font-bold hover:bg-accent-valencia/80" { "Submit" }
                                    }
                                }
                            }
                        }
                    }
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

                    // Pre-allocate with known capacity (11 elements)
                    let mut entry = Vec::with_capacity(11);
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
