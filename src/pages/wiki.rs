use maud::{Markup, PreEscaped, html};
use maudit::route::prelude::*;
use std::collections::HashMap;

use crate::{components::table_of_content, content::WikiEntry, layouts::base_layout};

// Helper function to build wiki navigation from all entries
fn wiki_navigation(ctx: &mut PageContext) -> maud::Markup {
    let wiki_source = ctx.content.get_source::<WikiEntry>("wiki");
    let mut categories: HashMap<String, Vec<(&str, &str, &str)>> = HashMap::new();
    let current_path = ctx.current_path;

    // Group entries by category
    for entry in &wiki_source.entries {
        let data = entry.data(ctx);
        if !data.navigation.hidden.unwrap_or(false) {
            let label = data.navigation.label.as_deref().unwrap_or(&data.title);
            categories
                .entry(data.navigation.category.clone())
                .or_default()
                .push((label, &entry.id, &data.navigation.category));
        }
    }

    // Sort categories and entries within each category
    let mut sorted_categories: Vec<_> = categories.into_iter().collect();
    sorted_categories.sort_by_key(|(category, _)| category.clone());

    for (_, entries) in &mut sorted_categories {
        entries.sort_by_key(|(label, _, _)| *label);
    }

    html! {
        nav."h-full p-2 md:p-4 md:pl-8 border-1 border-gray-200 bg-gray-50" {
            nav."text-base md:text-[0.95rem]" {
                @for (category, entries) in sorted_categories {
                    div."mb-3 md:mb-4" {
                        h4."mb-2 text-base md:text-sm mt-0 font-semibold" {
                            (category.replace('-', " ").split_whitespace().map(|word| {
                                let mut chars = word.chars();
                                match chars.next() {
                                    None => String::new(),
                                    Some(first) => first.to_uppercase().chain(chars).collect(),
                                }
                            }).collect::<Vec<_>>().join(" "))
                        }

                        ul."list-none m-0 p-0" {
                            @for (label, slug, entry_category) in entries {
                                @let page_url = WikiEntryPage.url(WikiParams { category: entry_category.to_string(), slug: slug.to_string() });
                                @let is_current = current_path == &page_url;
                                li."m-0 p-0 my-1" {
                                    a class=@if is_current { "text-white-sugar-cane bg-violet-ultra block px-3 py-2 md:px-2 md:py-1 text-lg md:text-base" } @else { "text-violet-ultra hover:bg-violet-ultra/10 block px-3 py-2 md:px-2 md:py-1 text-md md:text-base" }
                                      href=(page_url) {
                                        (label)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Helper function to create the wiki layout with left nav, main content, and optional right sidebar
fn wiki_layout(
    ctx: &mut PageContext,
    entry: Entry<WikiEntry>,
    right_sidebar: Option<maud::Markup>,
) -> Markup {
    ctx.assets.include_script("src/assets/wiki-sidebar.ts");

    let data = entry.data(ctx);

    let main_content = html!(
        article."prose prose-lg w-centered-width mx-auto px-5" {
            header.mt-8.mb-4 {
                h2.text-4xl.my-0 { (data.title) }
                @if let Some(tagline) = &data.tagline {
                    h3."lead text-xl mt-0" { (tagline) }
                }
            }
            div."prose prose-violet" {
                (PreEscaped(entry.render(ctx)))
            }
            @if let Some(last_modified) = &data.last_modified {
                footer."not-prose mt-8 pt-6 border-t border-gray-200 mb-12 text-right" {
                    p."text-sm text-gray-600" {
                        "Last modified on "
                        a."text-violet-ultra hover:text-white-sugar-cane hover:bg-violet-ultra" href=(last_modified.commit_url) {
                            time { (last_modified.date) }
                        }
                    }
                }
            }
        }
    );

    base_layout(
        Some(&data.title),
        data.tagline.as_deref(),
        html!(
            header.sticky.top-0.z-40.bg-white-sugar-cane.border-b.border-borders."sm:hidden".bg-linear-to-b."from-darker-white" {
                div.flex.items-center.justify-between {
                    button id="left-sidebar-toggle" .px-4.py-3.flex.items-center.gap-x-2.text-base.font-medium.text-our-black aria-label="Toggle navigation menu" {
                        (PreEscaped(include_str!("../assets/side-menu.svg")))
                        span { "Menu" }
                    }
                    button id="right-sidebar-toggle" .px-4.py-3.flex.items-center.gap-x-2.text-base.font-medium.text-our-black aria-label="Toggle table of contents" {
                        span { "On this page" }
                        (PreEscaped(include_str!("../assets/toc.svg")))
                    }
                }
            }

            // Mobile left sidebar overlay
            div id="mobile-left-sidebar" .fixed."inset-0 bg-black/50".transition-opacity.opacity-0.pointer-events-none.z-50 {
                div."w-80"."max-w-sm"."h-full"."bg-white-sugar-cane"."overflow-y-auto".transform."-translate-x-full".transition-transform {
                    div {
                        (wiki_navigation(ctx))
                    }
                }
            }

            // Mobile right sidebar overlay
            div id="mobile-right-sidebar" .fixed."inset-0 bg-black/50".transition-opacity.opacity-0.pointer-events-none.z-50.flex.justify-end {
                div.w-80.max-w-sm.h-full.bg-white-sugar-cane.overflow-y-auto.transform."translate-x-full".transition-transform {
                    div.px-4.py-4 {
                        @if let Some(ref sidebar) = right_sidebar {
                            (sidebar)
                        }
                    }
                }
            }
            div."" {
                div."grid grid-cols-1 gap-4 lg:grid-cols-5" {
                    // Left sidebar - Wiki Navigation (spans 1 column, narrower) - Hidden on mobile
                    div."hidden lg:block lg:col-span-1" {
                        (wiki_navigation(ctx))
                    }

                    // Main content (spans 3 columns on large screens, full width on mobile)
                    div."lg:col-span-3" {
                        (main_content)
                    }

                    // Right sidebar - Optional (spans 1 column) - Hidden on mobile
                    div."hidden lg:block lg:col-span-1" {
                        @if let Some(sidebar) = right_sidebar {
                            (sidebar)
                        }
                    }
                }
            }
        ),
        true,
        ctx,
    )
}
#[route("/wiki/")]
pub struct WikiIndex;

impl Route for WikiIndex {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let index_entry = ctx
            .content
            .get_source::<WikiEntry>("wiki")
            .get_entry("index");

        wiki_layout(
            ctx,
            index_entry.clone(),
            None, // No right sidebar for index
        )
    }
}

#[route("/wiki/[category]/[slug]")]
pub struct WikiEntryPage;

#[derive(Params, Clone)]
pub struct WikiParams {
    pub category: String,
    pub slug: String,
}

impl Route<WikiParams, Entry<WikiEntry>> for WikiEntryPage {
    fn pages(&self, ctx: &mut DynamicRouteContext) -> Pages<WikiParams, Entry<WikiEntry>> {
        ctx.content
            .get_source::<WikiEntry>("wiki")
            .into_pages(|entry| {
                let data = entry.data(ctx);
                Page {
                    params: WikiParams {
                        category: data.navigation.category.clone(),
                        slug: entry.id.clone(),
                    },
                    props: entry.clone(),
                }
            })
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let entry = ctx.props::<Entry<WikiEntry>>();
        let data = entry.data(ctx);

        let right_sidebar = html!(
            nav."p-4 pr-8 h-full p-2" {
                (table_of_content(&data.get_headings(), data.max_depth_toc))
            }
        );

        wiki_layout(ctx, entry.clone(), Some(right_sidebar))
    }
}
