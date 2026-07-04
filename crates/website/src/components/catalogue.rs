use maud::{Markup, html};

/// Which sidebar filters to show, and under what id prefix, so the catalogue
/// page and the collections pages share one implementation.
pub struct SidebarConfig<'a> {
    pub prefix: &'a str,
    pub mobile: bool,
    pub show_type: bool,
    pub show_status: bool,
    pub show_rating: bool,
    pub show_completion: bool,
    pub default_status: &'a str,
    pub sort_options: &'a [(&'a str, &'a str)],
    pub count_id: &'a str,
    pub count_label: &'a str,
}

const SORT_ORD_CLASS: &str = "m-0 cursor-pointer appearance-none text-lg before:text-rose-ebony before:content-['↑'] checked:before:content-['↓'] sm:text-base h-full w-auto";

pub fn catalogue_filters(cfg: &SidebarConfig) -> Markup {
    let container_class = if cfg.mobile {
        "flex flex-col gap-6"
    } else {
        "flex flex-col gap-y-2"
    };
    let field_class = if cfg.mobile { "flex flex-col gap-2" } else { "" };
    let label_class = if cfg.mobile { "font-bold text-sm" } else { "" };
    let sort_label_class = if cfg.mobile {
        "mb-1 flex items-center justify-between gap-x-2 font-bold text-sm"
    } else {
        "mb-1 flex items-center justify-between gap-x-2"
    };
    let id = |name: &str| format!("{}-{}", cfg.prefix, name);

    html! {
        div id=(format!("{}-filters", cfg.prefix)) class=(format!("catalogue-filters {}", container_class)) {
            div class=(field_class) {
                label class=(label_class) for=(id("search")) { "Search" }
                input id=(id("search")) type="search";
            }

            @if cfg.show_type {
                div class=(field_class) {
                    label class=(label_class) for=(id("types")) { "Type" }
                    select name="types" id=(id("types")) {
                        option value="" { "Type" }
                        option value="book" { "Book" }
                        option value="game" { "Game" }
                        option value="movie" { "Movie" }
                        option value="show" { "Show" }
                    }
                }
            }

            @if cfg.show_status {
                div class=(field_class) {
                    label class=(label_class) for=(id("status")) { "Status" }
                    select name="status" id=(id("status")) {
                        option value="finished" selected[cfg.default_status == "finished"] { "Finished" }
                        option value="planned" selected[cfg.default_status == "planned"] { "Planned" }
                        option value="all" selected[cfg.default_status == "all"] { "All" }
                    }
                }
            }

            @if cfg.show_rating {
                div class=(field_class) {
                    label class=(label_class) for=(id("ratings")) { "Rating" }
                    select name="ratings" id=(id("ratings")) {
                        option value="" { "Rating" }
                        option value="5" { "Masterpiece" }
                        option value="4" { "Loved" }
                        option value="3" { "Liked" }
                        option value="2" { "Okay" }
                        option value="1" { "Disliked" }
                        option value="0" { "Hated" }
                    }
                }
            }

            @if cfg.show_completion {
                div class=(field_class) {
                    label class=(label_class) for=(id("completion")) { "Completion" }
                    select name="completion" id=(id("completion")) {
                        option value="" { "All" }
                        option value="completed" { "Completed" }
                        option value="progress" { "In progress" }
                    }
                }
            }

            div class=(field_class) {
                label for=(id("sort")) class=(sort_label_class) {
                    "Sort"
                    input id=(id("sort-ord")) type="checkbox" class=(SORT_ORD_CLASS);
                }
                select name="sort" id=(id("sort")) {
                    @for (value, label) in cfg.sort_options {
                        option value=(value) { (label) }
                    }
                }
            }
        }
        div id=(cfg.count_id) class="mt-4" { (cfg.count_label) }
    }
}

/// A cover image styled exactly like the catalogue's entry covers.
pub fn cover_image(cover_url: &str, alt: &str, grayscale: bool, extra: &str) -> Markup {
    let dim = if grayscale { "grayscale" } else { "" };
    html! {
        img class=(format!("{} {}", extra, dim))
            width="180" height="270"
            src=(cover_url)
            loading="lazy"
            decoding="async"
            alt=(alt);
    }
}

/// The review modal shell, populated client-side. Shared by the catalogue and
/// collection pages so clicking an entry opens it in place either way.
pub fn review_modal() -> Markup {
    html! {
        div id="review-modal" class="hidden fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" {
            div class="bg-white-sugar-cane rounded-t-lg sm:rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col sm:max-h-[85vh]" {
                div id="review-modal-header" class="bg-accent-valencia px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center rounded-t-lg shrink-0" {
                    h2 id="review-modal-title" class="text-lg sm:text-xl font-bold text-white m-0" {
                        a id="review-modal-title-link" class="text-white underline-offset-2 hover:underline decoration-white" href="" {}
                    }
                    button id="close-review-modal" class="text-white hover:text-black text-2xl font-bold leading-none" { "×" }
                }
                div class="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 overflow-y-auto" {
                    img id="review-modal-cover" class="hidden w-full sm:w-[120px] max-h-48 sm:max-h-none shrink-0 object-contain sm:object-cover rounded self-start" src="" alt="";
                    div class="flex flex-col gap-3 min-w-0" {
                        div id="review-modal-meta" class="flex flex-col gap-y-0.5 text-sm text-subtle-charcoal" {}
                        div id="review-modal-collections" class="empty:hidden flex flex-wrap gap-1 items-center text-sm" {}
                        div id="review-modal-content" class="prose text-black" {}
                    }
                }
            }
        }
    }
}

pub struct CoverThumb {
    pub url: String,
    pub grayscale: bool,
}

/// A 2×2 montage in the same 3/4.3 frame as an entry cover. This grid is the
/// only markup unique to collections — everything else reuses catalogue styles.
pub fn montage_cover(covers: &[CoverThumb]) -> Markup {
    html! {
        div class="grid grid-cols-2 grid-rows-2 aspect-[3/4.3] w-full overflow-hidden bg-neutral-900/20" {
            @for slot in 0..4 {
                @if let Some(thumb) = covers.get(slot) {
                    (cover_image(&thumb.url, "", thumb.grayscale, "w-full h-full object-cover block"))
                } @else {
                    div class="w-full h-full bg-neutral-900/10" {}
                }
            }
        }
    }
}

pub struct CollectionCard {
    pub href: String,
    pub title: String,
    pub count: usize,
    pub finished: usize,
    pub avg_badge: Option<String>,
    pub covers: Vec<CoverThumb>,
    pub search: String,
    pub sort_activity: i64,
    pub sort_avg: i64,
}

/// A collection presented in the exact catalogue-card frame, with a montage
/// cover, a progress badge (top-left) and an average-feeling badge (top-right).
pub fn collection_card(card: &CollectionCard) -> Markup {
    let items_label = format!("{} {}", card.count, if card.count == 1 { "item" } else { "items" });
    let completed = card.count > 0 && card.finished == card.count;
    let progress_bg = if completed { "bg-emerald-600" } else { "bg-black/75" };
    html! {
        a href=(card.href) class="w-[180px] block"
            data-collection-card
            data-search=(card.search)
            data-count=(card.count)
            data-completed=(completed)
            data-activity=(card.sort_activity)
            data-avg=(card.sort_avg)
            data-title=(card.title)
            title=(card.title)
        {
            div class="relative group ring-accent-valencia hover:ring-2 transition-shadow" {
                (montage_cover(&card.covers))
                span class=(format!("absolute top-0 left-0 px-1.5 py-0.5 rounded-br-lg select-none font-bold text-xs text-white {}", progress_bg)) {
                    (card.finished) "/" (card.count)
                }
                @if let Some(avg) = &card.avg_badge {
                    span class="absolute top-0 right-0 px-1 py-0.5 bg-black/60 rounded-bl-lg select-none text-sm" {
                        (avg)
                    }
                }
                div class="absolute bottom-0 left-0 right-0 bg-black/70 group-hover:bg-accent-valencia transition-colors duration-200 text-white p-2" {
                    h4 class="m-0 leading-tight text-sm font-medium" { (card.title) }
                    p class="text-xs m-0" { (items_label) }
                }
            }
        }
    }
}

/// The floating "+" button that opens the add-entry modal (auth-gated by catalogue-add.ts).
pub fn add_entry_button() -> Markup {
    html! {
        button id="add-entry-btn" class="hidden fixed bottom-22 md:bottom-8 right-6 w-14 h-14 rounded-full bg-accent-valencia text-white text-2xl shadow-lg hover:bg-accent-valencia/80 transition-colors z-40" title="Add entry" {
                                "+"
                            }
    }
}

/// The add / plan / promote entry modal, driven by catalogue-add.ts.
pub fn add_entry_modal() -> Markup {
    html! {
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
}
