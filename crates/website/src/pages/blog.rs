use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use maud::html;
use maudit::route::prelude::*;

use crate::{components::article_preview, content::BlogPost, layouts::base_layout};

fn blog_sidebar(
    ctx: &mut PageContext,
    current_tag: Option<&str>,
    current_year: Option<i32>,
) -> maud::Markup {
    let (tags, years) = get_sorted_tags_and_years(ctx);

    html! {
        aside."mr-4 grow-0 basis-1/5 sm:my-8" {
            div."top-4 mt-4 flex flex-col items-center gap-y-6 sm:sticky sm:mt-0 sm:items-start" {
                @if current_tag.is_some() || current_year.is_some() {
                    a."button-style-bg-accent inline" href="/articles" { "See all" }
                }
                ul."m-0 flex list-none flex-wrap justify-center gap-1 p-0 sm:justify-start" {
                    @for (tag, _) in &tags {
                        @if Some(tag.as_str()) == current_tag {
                            span."button-style-bg-accent inline bg-white-sugar-cane text-accent-valencia" {
                                li { (tag) }
                            }
                        } @else {
                            a."button-style-bg-accent inline" href=(format!("/articles/tags/{}", tag)) {
                                li { (tag) }
                            }
                        }
                    }
                }
                ul."m-0 flex list-none flex-wrap gap-1 p-0" {
                    @for (year, _) in &years {
                        @if Some(*year) == current_year {
                            span."button-style-bg-accent inline bg-white-sugar-cane text-accent-valencia" {
                                li { (year) }
                            }
                        } @else {
                            a."button-style-bg-accent inline" href=(format!("/articles/years/{}", year)) {
                                li { (year) }
                            }
                        }
                    }
                }
            }
        }
    }
}

type TagsAndYears = (Vec<(String, i32)>, Vec<(i32, i32)>);
fn get_sorted_tags_and_years(ctx: &mut PageContext) -> TagsAndYears {
    let articles = ctx
        .content
        .get_source::<crate::content::BlogPost>("blog")
        .entries
        .iter()
        .filter(|e| !e.data(ctx).draft.unwrap_or(false))
        .collect::<Vec<_>>();

    let mut tags = articles
        .iter()
        .flat_map(|a| a.data(ctx).tags.clone())
        .fold(HashMap::new(), |mut acc, tag| {
            *acc.entry(tag).or_insert(0) += 1;
            acc
        })
        .into_iter()
        .collect::<Vec<(String, i32)>>();
    tags.sort_by(|a, b| {
        // Primary sort: by count descending
        match b.1.cmp(&a.1) {
            std::cmp::Ordering::Equal => {
                // Secondary sort: by tag name ascending (for stable sorting)
                a.0.cmp(&b.0)
            }
            other => other,
        }
    });

    let mut years = articles
        .iter()
        .map(|a| a.data(ctx).date.year())
        .fold(HashMap::new(), |mut acc, year| {
            *acc.entry(year).or_insert(0) += 1;
            acc
        })
        .into_iter()
        .collect::<Vec<(i32, i32)>>();
    years.sort_by(|a, b| b.0.cmp(&a.0)); // Sort by year descending

    (tags, years)
}

#[route("articles/[slug]")]
pub struct BlogPostPage;

#[derive(Params, Clone)]
struct Params {
    slug: String,
}

impl Route<Params> for BlogPostPage {
    fn pages(&self, context: &mut DynamicRouteContext) -> Pages<Params> {
        context
            .content
            .get_source::<BlogPost>("blog")
            .into_pages(|entry| Page {
                params: Params {
                    slug: entry.id.clone(),
                },
                props: (),
            })
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let params = ctx.params::<Params>();

        let article = ctx
            .content
            .get_source::<BlogPost>("blog")
            .get_entry(&params.slug);

        crate::layouts::article_layout(article, false, ctx)
    }
}

#[route("/articles")]
pub struct BlogIndex;

impl Route for BlogIndex {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let mut articles = ctx
            .content
            .get_source::<crate::content::BlogPost>("blog")
            .entries
            .iter() // Convert to an iterator
            .filter(|e| !e.data(ctx).draft.unwrap_or(false)) // Filter out drafts
            .collect::<Vec<_>>(); // Collect into a Vec to allow sorting

        articles.sort_by(|a, b| b.data(ctx).date.cmp(&a.data(ctx).date));

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts");

        base_layout(
            Some("Articles"),
            None,
            html!(
                article."flex flex-col gap-x-4 sm:flex-row" {
                    div."flex-1" {
                        div."masonry relative mx-2 my-4 sm:m-4" {
                            @for article in articles {
                                (article_preview(article, ctx))
                            }
                        }
                        div."mt-4 text-xl" {
                            // TODO: Pagination
                        }
                    }
                    (blog_sidebar(ctx, None, None))
                }
                (masonry_script)
            ),
            true,
            ctx,
        )
    }
}

#[route("/articles/tags/[tag]/[page]")]
pub struct BlogTagIndex;

#[derive(Params, Clone)]
struct TagParams {
    tag: String,
    page: Option<usize>,
}

impl Route<TagParams, PaginationPage<Entry<BlogPost>>> for BlogTagIndex {
    fn pages(
        &self,
        ctx: &mut DynamicRouteContext,
    ) -> Pages<TagParams, PaginationPage<Entry<BlogPost>>> {
        // Get all blog articles
        let articles = &ctx.content.get_source::<BlogPost>("blog").entries;

        // Collect all unique tags
        let unique_tags: HashSet<String> = articles
            .iter()
            .filter_map(|article| {
                if !article.data(ctx).draft.unwrap_or(false) {
                    Some(&article.data(ctx).tags)
                } else {
                    None
                }
            })
            .flatten()
            .cloned()
            .collect();

        let mut all_pages = Vec::new();

        for tag in unique_tags {
            let mut tag_articles: Vec<_> = articles
                .iter()
                .filter(|article| article.data(ctx).tags.contains(&tag))
                .cloned()
                .collect();

            tag_articles.sort_by(|a, b| b.data(ctx).date.cmp(&a.data(ctx).date));

            // Paginate the articles for this tag
            let tag_pages = paginate(tag_articles, 20, |page| TagParams {
                tag: tag.clone(),
                page: if page == 0 { None } else { Some(page) },
            });

            all_pages.extend(tag_pages);
        }

        all_pages
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let params = ctx.params::<TagParams>();
        let props = ctx.props::<PaginationPage<Entry<BlogPost>>>();

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts");

        base_layout(
            Some(&format!("Articles tagged with {}", params.tag)),
            None,
            html!(
                article."flex flex-col gap-x-4 sm:flex-row" {
                    div."flex-1" {
                        div."masonry relative mx-2 my-4 sm:m-4" {
                            @for article in &props.items {
                                (article_preview(article, ctx))
                            }
                        }
                    }
                    (blog_sidebar(ctx, Some(&params.tag), None))
                }
                (masonry_script)
            ),
            true,
            ctx,
        )
    }
}

#[route("/articles/years/[year]/[page]")]
pub struct BlogYearIndex;

#[derive(Params, Clone)]
struct YearParams {
    year: i32,
    page: Option<usize>,
}

impl Route<YearParams, PaginationPage<Entry<BlogPost>>> for BlogYearIndex {
    fn pages(
        &self,
        ctx: &mut DynamicRouteContext,
    ) -> Pages<YearParams, PaginationPage<Entry<BlogPost>>> {
        // Get all blog articles
        let articles = &ctx.content.get_source::<BlogPost>("blog").entries;

        // Collect all unique years
        let unique_years: HashSet<i32> = articles
            .iter()
            .filter_map(|e| {
                if !e.data(ctx).draft.unwrap_or(false) {
                    Some(e.data(ctx).date.year())
                } else {
                    None
                }
            })
            .collect();

        let mut all_pages = Vec::new();

        for year in unique_years {
            let mut year_articles: Vec<_> = articles
                .iter()
                .filter(|article| article.data(ctx).date.year() == year)
                .cloned()
                .collect();

            year_articles.sort_by(|a, b| b.data(ctx).date.cmp(&a.data(ctx).date));

            // Paginate the articles for this year
            let year_pages = paginate(year_articles, 20, |page| YearParams {
                year,
                page: if page == 0 { None } else { Some(page) },
            });

            all_pages.extend(year_pages);
        }

        all_pages
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let params = ctx.params::<YearParams>();
        let props = ctx.props::<PaginationPage<Entry<BlogPost>>>();

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts");

        base_layout(
            Some(&format!("Articles from {}", params.year)),
            None,
            html!(
                article."flex flex-col gap-x-4 sm:flex-row" {
                    div."flex-1" {
                        div."masonry relative mx-2 my-4 sm:m-4" {
                            @for article in &props.items {
                                (article_preview(article, ctx))
                            }
                        }
                    }
                    (blog_sidebar(ctx, None, Some(params.year)))
                }
                (masonry_script)
            ),
            true,
            ctx,
        )
    }
}
