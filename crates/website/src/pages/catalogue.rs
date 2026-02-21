use std::hash::{DefaultHasher, Hash, Hasher};

use maud::{html, PreEscaped};
use maudit::route::prelude::*;

use crate::components::icon::{icon, Icon};
use crate::components::mobile_menu;
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

                        div id="add-entry-modal" class="hidden fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" {
                        div class="bg-white-sugar-cane rounded-lg max-w-2xl w-full" {
                            div class="bg-accent-valencia px-6 py-4 flex justify-between items-center rounded-t-lg" {
                                h2 class="text-xl font-bold text-white" { "Add catalogue entry" }
                                button id="close-modal" class="text-white hover:text-black text-2xl font-bold" { "×" }
                            }

                            div class="p-6" {
                                form id="add-entry-form" class="space-y-4 text-black" {
                                    div id="selected-result" class="flex justify-center items-center gap-2" {
                                        img id="selected-cover" class="w-12 h-16 object-cover rounded hidden" src="" {};
                                        div id="selected-cover-placeholder" class="w-12 h-16 bg-zinc-300 rounded" {}
                                        span id="selected-title" class="font-medium" { "No selection" }
                                        input type="hidden" id="entry-source-id" name="source-id";
                                    }

                                    div class="flex items-end" {
                                        label class="w-1/4 md:w-[15%]" {
                                            span class="block text-sm font-bold mb-1" { "Type" }
                                            select id="entry-type" name="type" class="w-full px-3 py-2 bg-white border-y-2 border-l-2 border-black rounded-l rounded-r-none font-medium h-10" required {
                                                option value="" { "Select" }
                                                option value="game" { "Game" }
                                                option value="movie" { "Movie" }
                                                option value="tv" { "Show" }
                                                option value="book" { "Book" }
                                            }
                                        }
                                        label class="flex-1" {
                                            span class="block text-sm font-bold mb-1" { "Title" }
                                            div class="flex" {
                                                input id="entry-name" name="name" class="flex-1 px-3 py-2 bg-white border-2 border-black rounded-r font-medium h-10 disabled:bg-zinc-400 disabled:cursor-not-allowed" placeholder="Select type first..." disabled;
                                                button type="button" class="search-btn px-4 py-2 bg-black text-white hover:bg-zinc-700 rounded font-medium -ml-2 h-10 md:hidden" {
                                                    (icon(Icon::Search, 20, "Search"))
                                                }
                                                button type="button" class="search-btn px-4 py-2 bg-black text-white hover:bg-zinc-700 rounded font-medium -ml-2 h-10 hidden md:block" { "Search" }
                                            }
                                        }
                                    }

                                    div class="relative" {
                                        div id="search-results" class="mt-2 max-h-40 overflow-y-auto hidden border-2 border-black bg-white absolute z-10 left-0 right-0" {}
                                    }

                                    div class="block" {
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

                                    div id="platform-field" class="hidden" {
                                        label {
                                            span class="block text-sm font-bold mb-1" { "Platform" }
                                            input id="entry-platform" name="platform-select" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium" placeholder="e.g., pc, ps5, switch";
                                        }
                                    }

                                    div {
                                        label {
                                            span class="block text-sm font-bold mb-1" { "Date finished" }
                                            input type="date" id="entry-date" name="date" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium" required;
                                        }
                                    }

                                    div {
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

                                    button type="submit" class="w-full bg-accent-valencia text-white py-3 rounded font-bold hover:bg-accent-valencia/80" { "Submit" }
                                }
                            }
                        }
                    }

                    script {
                        (PreEscaped(r#"
                        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                            ? "http://localhost:8787"
                            : "https://api.erika.florist";

                        let isAuthenticated = false;

                        async function checkAuth() {
                            if (!document.cookie.split(';').some(c => c.trim().startsWith('logged_in='))) {
                                return;
                            }

                            try {
                                const response = await fetch(API_URL + '/auth', {
                                    credentials: 'include'
                                });
                                if (!response.ok) {
                                    return;
                                }
                                const data = await response.json();
                                isAuthenticated = data.authenticated;
                                if (isAuthenticated) {
                                    document.getElementById('add-entry-btn').classList.remove('hidden');
                                }
                            } catch (e) {
                                console.error('Auth check failed:', e);
                            }
                        }

                        checkAuth();

                        const modal = document.getElementById('add-entry-modal');
                        const btn = document.getElementById('add-entry-btn');
                        const close = document.getElementById('close-modal');
                        const form = document.getElementById('add-entry-form');
                        const typeSelect = document.getElementById('entry-type');
                        const titleInput = document.getElementById('entry-name');
                        const platformField = document.getElementById('platform-field');
                        const searchBtn = document.querySelector('.search-btn');
                        const searchResults = document.getElementById('search-results');
                        const selectedResult = document.getElementById('selected-result');

                        btn.onclick = () => modal.classList.remove('hidden');
                        close.onclick = () => modal.classList.add('hidden');
                        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

                        typeSelect.onchange = () => {
                            const hasType = typeSelect.value !== '';
                            titleInput.disabled = !hasType;
                            titleInput.placeholder = hasType ? 'Search by title...' : 'Select type first...';
                            platformField.classList.toggle('hidden', typeSelect.value !== 'game');
                        };

                        async function search() {
                            const query = document.getElementById('entry-name').value;
                            const type = typeSelect.value;
                            if (!query || !type) return;

                            const sourceMap = { game: 'igdb', movie: 'tmdb', tv: 'tmdb', book: 'isbn' };
                            const source = sourceMap[type];
                            const tmdbType = type === 'tv' ? 'tv' : 'movie';

                            try {
                                const response = await fetch(API_URL + '/search?source=' + source + '&query=' + encodeURIComponent(query) + '&type=' + tmdbType, {
                                    credentials: 'include'
                                });
                                const text = await response.text();
                                const data = JSON.parse(text);
                                displayResults(data, type);
                            } catch (e) {
                                console.error('Search failed:', e);
                            }
                        }

                        function displayResults(data, type) {
                            searchResults.innerHTML = '';
                            searchResults.classList.remove('hidden');

                            let results = [];
                            if (type === 'game') {
                                results = data.map(g => ({ id: g.id, name: g.name, cover: g.cover?.url }));
                            } else if (type === 'book') {
                                results = data.docs?.map(b => ({ id: b.isbn?.[0] || b.key, name: b.title, cover: b.cover_i ? 'https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg' : null })) || [];
                            } else {
                                results = data.results?.map(m => ({ id: m.id, name: m.title, cover: m.poster_path ? 'https://image.tmdb.org/t/p/w92' + m.poster_path : null })) || [];
                            }

                            results.forEach(r => {
                                const div = document.createElement('div');
                                div.className = 'flex items-center gap-2 p-2 hover:bg-zinc-200 cursor-pointer text-black';
                                if (r.cover) {
                                    const coverUrl = r.cover.startsWith('//') ? 'https:' + r.cover : r.cover;
                                    div.innerHTML = '<img src="' + coverUrl + '" class="w-8 h-12 object-cover flex-shrink-0"><span class="text-sm truncate">' + r.name + '</span>';
                                } else {
                                    div.innerHTML = '<div class="w-8 h-12 bg-gray-300 flex-shrink-0"></div><span class="text-sm truncate">' + r.name + '</span>';
                                }
                                div.onclick = () => selectResult(r);
                                searchResults.appendChild(div);
                            });
                        }

                        function selectResult(result) {
                            document.getElementById('entry-name').value = result.name;
                            document.getElementById('entry-source-id').value = result.id;
                            document.getElementById('entry-source-id-display').value = result.id;
                            document.getElementById('selected-title').textContent = result.name;
                            const coverImg = document.getElementById('selected-cover');
                            if (result.cover) {
                                const coverUrl = result.cover.startsWith('//') ? 'https:' + result.cover : result.cover;
                                coverImg.src = coverUrl;
                                coverImg.classList.remove('hidden');
                                document.getElementById('selected-cover-placeholder').classList.add('hidden');
                            } else {
                                coverImg.classList.add('hidden');
                                document.getElementById('selected-cover-placeholder').classList.remove('hidden');
                            }
                            searchResults.classList.add('hidden');
                        }

                        searchBtn.onclick = search;
                        document.getElementById('entry-name').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } };

                        form.onsubmit = async (e) => {
                            e.preventDefault();
                            const errorDiv = document.getElementById('form-error');
                            errorDiv.classList.add('hidden');

                            const formData = new FormData();
                            formData.append('type', document.getElementById('entry-type').value);
                            formData.append('name', document.getElementById('entry-name').value);
                            const rating = document.querySelector('input[name="rating"]:checked')?.value;
                            if (!rating) {
                                errorDiv.textContent = 'Please select a rating';
                                errorDiv.classList.remove('hidden');
                                return;
                            }
                            formData.append('rating', rating);
                            formData.append('date', document.getElementById('entry-date').value);
                            formData.append('source-id', document.getElementById('entry-source-id-display').value || document.getElementById('entry-source-id').value);
                            formData.append('platform-select', document.getElementById('entry-platform').value);
                                            formData.append('comment', document.getElementById('entry-comment').value);
                                            formData.append('form-password', document.getElementById('form-password').value);
                            if (document.getElementById('skip-ci').checked) {
                                formData.append('skip-ci', 'skip-ci');
                            }

                            try {
                                const response = await fetch(API_URL + '/commit', {
                                    method: 'POST',
                                    body: formData,
                                    credentials: 'include'
                                });

                                if (response.ok) {
                                    window.location.reload();
                                } else {
                                    const data = await response.json();
                                    errorDiv.textContent = data.message || 'Failed to submit';
                                    errorDiv.classList.remove('hidden');
                                }
                            } catch (err) {
                                errorDiv.textContent = 'An error occurred';
                                errorDiv.classList.remove('hidden');
                            }
                        };
                        "#
                        ))
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
                    let rendered_content = item.render(ctx);
                    let (cover_url, placeholder) = &data.cover;

                    // Pre-allocate with known capacity (9 elements)
                    let mut entry = Vec::with_capacity(9);
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
