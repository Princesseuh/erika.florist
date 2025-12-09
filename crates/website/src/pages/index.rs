use maud::html;
use maudit::route::prelude::*;

use crate::{
    components::article_preview,
    content::{BlogPost, WikiEntry},
    layouts::base_layout,
    pages::{WikiEntryPage, wiki::WikiParams},
};

#[route("/")]
pub struct Index;

enum IndexEntry<'a> {
    Blog(&'a Entry<BlogPost>),
    Wiki(&'a Entry<WikiEntry>),
}

impl Route for Index {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts").unwrap();

        let articles = ctx
            .content
            .get_source::<crate::content::BlogPost>("blog")
            .entries
            .iter()
            .filter(|e| !e.data(ctx).draft.unwrap_or(false))
            .collect::<Vec<_>>();

        let wiki_entries = ctx
            .content
            .get_source::<crate::content::WikiEntry>("wiki")
            .entries
            .iter()
            .filter(|e| e.id != "index")
            .collect::<Vec<_>>();

        let mut merged: Vec<IndexEntry> = articles.into_iter().map(IndexEntry::Blog).collect();

        merged.extend(wiki_entries.into_iter().map(IndexEntry::Wiki));

        merged.sort_by(|a, b| {
            let a_date = match a {
                IndexEntry::Blog(entry) => entry.data(ctx).date,
                IndexEntry::Wiki(entry) => entry.data(ctx).last_modified.as_ref().unwrap().date,
            };
            let b_date = match b {
                IndexEntry::Blog(entry) => entry.data(ctx).date,
                IndexEntry::Wiki(entry) => entry.data(ctx).last_modified.as_ref().unwrap().date,
            };
            b_date.cmp(&a_date)
        });

        base_layout(
            None,
            None,
            html!(
                div."masonry relative mx-2 my-4 sm:m-4" {
                    @for entry in merged {
                        @match entry {
                            IndexEntry::Blog(article) => {
                                (article_preview(&article, ctx))
                            },
                            IndexEntry::Wiki(entry) => {
                                @let entry_data = entry.data(ctx);
                                @let last_modified = entry_data.last_modified.as_ref().map(|lm| lm.date.to_string()).unwrap_or_default();
                                div."absolute m-0" {
                                    a href=(WikiEntryPage.url(WikiParams {category: entry_data.navigation.category.clone(), slug: entry.id.clone() })) class="group block break-words border border-solid border-violet-ultra/15 px-6 py-2 font-medium leading-tight text-violet-ultra hover:bg-violet-ultra hover:text-white-sugar-cane focus:bg-violet-ultra focus:text-white-sugar-cane sm:break-normal" {
                                        ( entry_data.title )
                                        span."block text-sm text-black-charcoal first-letter:uppercase group-hover:text-white-sugar-cane group-focus:text-white-sugar-cane" data-date=(last_modified) {
                                            (last_modified)
                                        }
                                    }
                                }
                            },
                        }
                    }
                }
                (masonry_script)
            ),
            true,
            ctx,
        )
    }
}
