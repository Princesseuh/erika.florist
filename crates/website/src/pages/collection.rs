use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::NaiveDate;
use maud::{PreEscaped, html};
use maudit::route::prelude::*;

use crate::components::catalogue::{
    CollectionCard, CoverThumb, SidebarConfig, catalogue_filters, collection_card, review_modal,
};
use crate::components::{icon::Icon, mobile_menu};
use crate::content::{
    CatalogueBook, CatalogueGame, CatalogueMetadata, CatalogueMovie, CatalogueShow, Collection,
    CollectionMember, MediaType, Status,
};
use crate::layouts::base_layout;
use crate::state;

/// Just enough to draw a collection tile on the listing page (montage + average
/// feeling + last activity + searchable text). The detail page renders its
/// entries client-side via the catalogue itself, so it needs none of this.
#[derive(Clone)]
struct MemberCard {
    cover_url: String,
    rating: Option<u8>,
    planned: bool,
    finished_date: Option<NaiveDate>,
    search_text: String,
}

fn member_key(member: &CollectionMember) -> String {
    format!("{}/{}", member.media_type.slug_suffix(), member.slug)
}

fn rating_emoji(rating: u8) -> &'static str {
    match rating {
        5 => "❤️",
        4 => "🥰",
        3 => "🙂",
        2 => "😐",
        1 => "😕",
        _ => "🙁",
    }
}

/// Average feeling across the rated (finished) members, rounded to a bucket.
fn average_rating(members: &[MemberCard]) -> Option<u8> {
    let ratings: Vec<u8> = members.iter().filter_map(|card| card.rating).collect();
    if ratings.is_empty() {
        return None;
    }
    let sum: u32 = ratings.iter().map(|r| u32::from(*r)).sum();
    Some((sum as f32 / ratings.len() as f32).round() as u8)
}

/// Resolve only the members referenced by at least one collection into cards,
/// so we don't touch (and register cover assets for) the whole catalogue.
fn build_cards(ctx: &mut PageContext, referenced: &HashSet<String>) -> HashMap<String, MemberCard> {
    let mut cards: HashMap<String, MemberCard> = HashMap::new();

    macro_rules! collect {
        ($ty:ty, $source:expr, $media_type:expr) => {{
            let entries: Vec<_> = ctx.content::<$ty>($source).entries().collect();
            for entry in entries {
                let key = format!("{}/{}", $media_type.slug_suffix(), entry.id);
                if !referenced.contains(&key) {
                    continue;
                }
                let data = entry.data(ctx);
                let (cover_url, _placeholder) = data.get_cover().clone();
                let title = data.get_title().to_string();
                let author = data.get_author();
                let release_year = data.get_release_year();
                let mut search_text = title.to_lowercase();
                if let Some(author) = &author {
                    search_text.push(' ');
                    search_text.push_str(&author.to_lowercase());
                }
                if let Some(year) = release_year {
                    search_text.push(' ');
                    search_text.push_str(&year.to_string());
                }
                cards.insert(
                    key,
                    MemberCard {
                        rating: data.get_rating().map(|r| r.to_number()),
                        planned: data.get_status() == Status::Planned,
                        finished_date: data.get_finished_date(),
                        cover_url,
                        search_text,
                    },
                );
            }
        }};
    }

    collect!(CatalogueGame, "games", MediaType::Game);
    collect!(CatalogueMovie, "movies", MediaType::Movie);
    collect!(CatalogueShow, "shows", MediaType::Show);
    collect!(CatalogueBook, "books", MediaType::Book);

    cards
}

fn resolve_members(
    members: &[CollectionMember],
    cards: &HashMap<String, MemberCard>,
) -> Vec<MemberCard> {
    members
        .iter()
        .filter_map(|member| cards.get(&member_key(member)).cloned())
        .collect()
}

struct CollectionView {
    slug: String,
    title: String,
    members: Vec<MemberCard>,
    avg_rating: Option<u8>,
    last_activity: Option<NaiveDate>,
    search_data: String,
}

fn load_collections(ctx: &mut PageContext) -> Vec<(String, String, Vec<CollectionMember>)> {
    let entries: Vec<_> = ctx.content::<Collection>("collections").entries().collect();
    entries
        .into_iter()
        .map(|entry| {
            let slug = entry.id.clone();
            let data = entry.data(ctx);
            (slug, data.title.clone(), data.members.clone())
        })
        .collect()
}

fn list_sidebar(prefix: &str, mobile: bool) -> maud::Markup {
    catalogue_filters(&SidebarConfig {
        prefix,
        mobile,
        show_type: false,
        show_status: false,
        show_rating: false,
        show_completion: true,
        show_date_range: true,
        show_collection: false,
        default_status: "all",
        sort_options: &[("activity", "Activity"), ("alphabetical", "Title")],
        count_id: "collections-entry-count",
        count_label: "... collections",
    })
}

#[route("/catalogue/collections/")]
pub struct Collections;

impl Route for Collections {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/collections.ts")?;

        let collections = load_collections(ctx);

        let mut referenced: HashSet<String> = HashSet::new();
        for (_, _, members) in &collections {
            for member in members {
                referenced.insert(member_key(member));
            }
        }
        let cards = build_cards(ctx, &referenced);

        let mut views: Vec<CollectionView> = collections
            .into_iter()
            .map(|(slug, title, members)| {
                let resolved = resolve_members(&members, &cards);
                let last_activity = resolved
                    .iter()
                    .filter(|card| !card.planned)
                    .filter_map(|card| card.finished_date)
                    .max();
                let mut search_data = title.to_lowercase();
                for card in &resolved {
                    search_data.push(' ');
                    search_data.push_str(&card.search_text);
                }
                CollectionView {
                    avg_rating: average_rating(&resolved),
                    members: resolved,
                    slug,
                    title,
                    last_activity,
                    search_data,
                }
            })
            .collect();

        // Newest activity first; collections with no finished members sink to the bottom.
        views.sort_by(|a, b| {
            b.last_activity
                .cmp(&a.last_activity)
                .then_with(|| a.title.cmp(&b.title))
        });

        Ok(base_layout(
            Some("Collections".into()),
            Some("Groupings of things I've played, watched, and read together.".into()),
            html!(
                (mobile_menu("collections", list_sidebar("mobile-collections", true), Icon::Search))

                article class="mx-4 my-4" {
                    div class="flex relative" {
                        aside class="hidden sm:block grow-0 sm:my-4 px-4 pr-8 w-64" {
                            p class="text-sm mb-4" { "Marathons, series, and themed runs. Planned entries are dimmed." }
                            div class="flex gap-x-2 mb-4" {
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/" { "Catalogue" }
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/stats/" { "Stats" }
                            }
                            div class="sticky top-4" {
                                (list_sidebar("collections", false))
                            }
                        }
                        div class="flex-1" {
                            div class="grid grid-cols-[repeat(auto-fit,180px)] justify-center gap-2" id="collections-content" {
                                @for view in &views {
                                    (collection_card(&CollectionCard {
                                        href: format!("/catalogue/collections/{}/", view.slug),
                                        title: view.title.clone(),
                                        count: view.members.len(),
                                        finished: view.members.iter().filter(|card| !card.planned).count(),
                                        avg_badge: view.avg_rating.map(|r| rating_emoji(r).to_string()),
                                        covers: view.members.iter().take(4).map(|card| CoverThumb {
                                            url: card.cover_url.clone(),
                                            dimmed: card.planned,
                                        }).collect(),
                                        search: view.search_data.clone(),
                                        sort_activity: view.last_activity
                                            .and_then(|d| d.and_hms_opt(0, 0, 0))
                                            .map(|dt| dt.and_utc().timestamp_millis())
                                            .unwrap_or(0),
                                        sort_avg: view.avg_rating.map(i64::from).unwrap_or(-1),
                                    }))
                                }
                            }

                            p id="collections-empty" class="hidden text-sm text-subtle-charcoal mt-4" {
                                "No collections match your search."
                            }

                            button id="add-collection-btn" class="hidden fixed bottom-22 md:bottom-8 right-6 w-14 h-14 rounded-full bg-accent-valencia text-white text-2xl shadow-lg hover:bg-accent-valencia/80 transition-colors z-40" title="New collection" {
                                "+"
                            }
                        }
                    }

                    (create_collection_modal())
                }
            ),
            true,
            Some("scrollbar-gutter-stable"),
            ctx,
        ))
    }
}

#[route("/catalogue/collections/[slug]")]
pub struct CollectionPage;

#[derive(Params, Clone)]
pub struct CollectionParams {
    pub slug: String,
}

impl Route<CollectionParams, Entry<Collection>> for CollectionPage {
    fn pages(&self, ctx: &mut DynamicRouteContext) -> Pages<CollectionParams, Entry<Collection>> {
        ctx.content::<Collection>("collections")
            .into_pages(|entry| {
                Page::new(
                    CollectionParams {
                        slug: entry.id.clone(),
                    },
                    entry.clone(),
                )
            })
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        // The detail page IS the catalogue, scoped to this collection's members —
        // same cards, filters, sorting, modal and add flow, all client-side.
        ctx.assets.include_script("src/assets/catalogue.ts")?;
        ctx.assets.include_script("src/assets/catalogue-add.ts")?;

        let entry = ctx.props::<Entry<Collection>>();
        let collection_slug = entry.id.clone();
        let (title, members) = {
            let data = entry.data(ctx);
            (data.title.clone(), data.members.clone())
        };
        let description = entry.render(ctx);

        let page_length: usize = 32;
        let catalogue_hash = state::get_catalogue_hash().unwrap_or_default();
        // IDB ids are `<slug>-<type>`; catalogue.ts filters the grid to this set.
        let member_ids = members
            .iter()
            .map(|member| format!("{}-{}", member.slug, member.media_type.slug_suffix()))
            .collect::<Vec<_>>()
            .join(",");

        let referenced: HashSet<String> = members.iter().map(member_key).collect();
        let cards = build_cards(ctx, &referenced);
        let resolved = resolve_members(&members, &cards);
        let total = resolved.len();
        let finished = resolved.iter().filter(|card| !card.planned).count();
        let pct = if total > 0 { finished * 100 / total } else { 0 };

        let heading = |extra: &str| {
            html!(
                a href="/catalogue/collections/" class=(format!("button-style-bg-accent block w-full text-center mb-4 {}", extra)) {
                    "All collections"
                }
                h1 class="text-xl font-bold m-0 mt-1" { (title) }
                @if !description.trim().is_empty() {
                    div class="prose prose-sm mt-2" { (PreEscaped(description.clone())) }
                }
                div class="mt-3 mb-4" {
                    div class="flex justify-between items-baseline text-xs font-bold text-subtle-charcoal mb-1" {
                        span { "Completed" }
                        span { (finished) "/" (total) " · " (pct) "%" }
                    }
                    div class="h-2 bg-black/10 rounded-full overflow-hidden" {
                        div class="h-full bg-emerald-600" style=(format!("width:{}%", pct)) {}
                    }
                }
            )
        };

        Ok(base_layout(
            Some(title.clone()),
            None,
            html!(
                (mobile_menu("collection", collection_filters("mobile-catalogue", true), Icon::Search))

                article.mx-4.my-4 {
                    div class="sm:hidden mb-4" { (heading("")) }

                    div.flex.relative id="catalogue-core" data-pagelength=(page_length) data-latest=(catalogue_hash) data-collection=(member_ids) data-collection-slug=(collection_slug) {
                        aside class="hidden sm:block grow-0 sm:my-4 px-4 pr-8 w-64" {
                            div class="sticky top-4" {
                                (heading(""))
                                (collection_filters("catalogue", false))
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

                            (crate::components::catalogue::add_entry_button())
                        }
                    }

                    (review_modal())
                    (crate::components::catalogue::add_entry_modal())
                }
            ),
            true,
            Some("scrollbar-gutter-stable"),
            ctx,
        ))
    }
}

/// Catalogue sidebar filters, defaulting to release order and showing planned
/// entries (collections mix played and backlog). Uses the catalogue's ids so
/// catalogue.ts drives them.
fn collection_filters(prefix: &str, mobile: bool) -> maud::Markup {
    catalogue_filters(&SidebarConfig {
        prefix,
        mobile,
        show_type: true,
        show_status: true,
        show_rating: true,
        show_completion: false,
        show_date_range: true,
        show_collection: false,
        default_status: "all",
        sort_options: &[
            ("release", "Release"),
            ("date", "Date"),
            ("rating", "Rating"),
            ("alphabetical", "Title"),
        ],
        count_id: "catalogue-entry-count",
        count_label: "... entries",
    })
}

fn create_collection_modal() -> maud::Markup {
    html! {
        div id="collection-modal" class="hidden fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" {
            div class="bg-white-sugar-cane rounded-t-lg sm:rounded-lg max-w-2xl w-full max-h-[95vh] flex flex-col" {
                div class="bg-accent-valencia px-6 py-4 flex justify-between items-center rounded-t-lg shrink-0" {
                    h2 class="text-xl font-bold text-white" { "New collection" }
                    button type="button" id="collection-close" class="text-white hover:text-black text-2xl font-bold" { "×" }
                }
                div class="p-6 overflow-y-auto text-black" {
                    form id="collection-form" class="space-y-4" {
                        div {
                            label class="block text-sm font-bold mb-1" for="collection-title" { "Title" }
                            input id="collection-title" name="title" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium" required;
                        }
                        div {
                            label class="block text-sm font-bold mb-1" for="collection-description" { "Description" }
                            textarea id="collection-description" name="description" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium h-20" placeholder="What ties these together…" {}
                        }
                        div class="border-2 border-black rounded p-3 space-y-2" {
                            span class="block text-sm font-bold" { "Members" }
                            div class="flex items-end gap-2" {
                                label class="w-1/3" {
                                    span class="block text-xs font-bold mb-1" { "Type" }
                                    select id="collection-member-type" class="w-full px-2 py-2 bg-white border-2 border-black rounded font-medium h-10" {
                                        option value="game" { "Game" }
                                        option value="movie" { "Movie" }
                                        option value="tv" { "Show" }
                                        option value="book" { "Book" }
                                    }
                                }
                                label class="flex-1" {
                                    span class="block text-xs font-bold mb-1" { "Search" }
                                    input id="collection-member-search" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium h-10" placeholder="Search catalogue or add new…";
                                }
                            }
                            div id="collection-member-results" class="hidden max-h-40 overflow-y-auto border-2 border-black bg-white" {}
                            ul id="collection-members" class="space-y-1 text-sm" {}
                        }
                        div id="collection-error" class="hidden bg-red-100 border-2 border-red-600 text-red-600 px-4 py-3 rounded font-bold" {}
                        div {
                            label class="block text-sm font-bold mb-1" for="collection-password" { "Password" }
                            input type="password" id="collection-password" name="collection-password" class="w-full px-3 py-2 bg-white border-2 border-black rounded font-medium" required;
                        }
                        div class="flex items-center gap-2" {
                            input type="checkbox" id="collection-skip-ci" value="skip-ci";
                            label for="collection-skip-ci" class="text-sm font-bold" { "Skip CI/CD" }
                        }
                        button type="submit" id="collection-submit" class="w-full bg-accent-valencia text-white py-3 rounded font-bold hover:bg-accent-valencia/80" { "Create collection" }
                    }
                }
            }
        }
    }
}

/// `"{type}/{slug}" -> [{slug, title}]`: every entry mapped to the collections containing it.
pub fn build_collections_index(ctx: &mut PageContext) -> BTreeMap<String, Vec<serde_json::Value>> {
    let collections: Vec<_> = ctx.content::<Collection>("collections").entries().collect();

    let mut map: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();
    for entry in collections {
        let slug = entry.id.clone();
        let data = entry.data(ctx);
        let title = data.title.clone();
        for member in &data.members {
            map.entry(member_key(member))
                .or_default()
                .push(serde_json::json!({
                    "slug": slug,
                    "title": title,
                }));
        }
    }

    map
}
