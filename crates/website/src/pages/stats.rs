use maud::html;
use maudit::route::prelude::*;

use crate::components::catalogue::{SidebarConfig, catalogue_filters};
use crate::components::icon::Icon;
use crate::components::mobile_menu;
use crate::layouts::base_layout;
use crate::state;

fn stats_sidebar(prefix: &str, mobile: bool) -> maud::Markup {
    catalogue_filters(&SidebarConfig {
        prefix,
        mobile,
        show_type: true,
        show_status: true,
        show_rating: true,
        show_completion: false,
        show_date_range: true,
        show_collection: true,
        default_status: "all",
        sort_options: &[],
        count_id: "stats-entry-count",
        count_label: "… entries",
    })
}

fn stats_mobile_filters() -> maud::Markup {
    stats_sidebar("mobile-catalogue", true)
}

#[route("/catalogue/stats/")]
pub struct Stats;

impl Route for Stats {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/stats.ts")?;
        ctx.assets.include_script("src/assets/masonry.ts")?;

        // Empty on incremental rebuilds where CatalogueContent stayed cached; stats.ts refetches.
        let catalogue_hash = state::get_catalogue_hash().unwrap_or_default();

        Ok(base_layout(
            Some("Catalogue stats".into()),
            Some(
                "Charts and numbers about everything I've played, watched, read and listened to."
                    .into(),
            ),
            html!(
                (mobile_menu("stats", stats_mobile_filters(), Icon::Search))

                article.mx-4.my-4 {
                    p class="sm:hidden text-sm mb-4" { "Charts and numbers about everything I've played, watched, read and listened to. Filter with the menu in the bottom-right." }

                    div.flex.relative id="stats-core" data-latest=(catalogue_hash) {
                        aside class="hidden sm:block grow-0 sm:my-4 px-4 pr-8 w-64" {
                            p class="text-sm mb-4" { "Charts and numbers about everything I've played, watched, read and listened to." }
                            div class="flex gap-x-2 mb-4" {
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/" { "Catalogue" }
                                a."button-style-bg-accent block w-full text-center" href="/catalogue/collections/" { "Collections" }
                            }
                            div class="sticky top-4" {
                                (stats_sidebar("catalogue", false))
                            }
                        }
                        div.flex-1 {
                            div id="stats-content" class="masonry relative" {
                                @for _ in 0..6 {
                                    div class="border border-solid border-accent-valencia/10 bg-accent-valencia/5 h-52 animate-pulse" {}
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
