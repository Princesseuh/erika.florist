use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use maud::{html, PreEscaped};
use maudit::route::prelude::*;

use crate::{components::article_preview, content::BlogPost, layouts::base_layout};

fn blog_sidebar_content(
    ctx: &mut PageContext,
    current_tag: Option<&str>,
    current_year: Option<i32>,
) -> maud::Markup {
    let (tags, years) = get_sorted_tags_and_years(ctx);

    html! {
        @if current_tag.is_some() || current_year.is_some() {
            a."button-style-bg-accent inline mb-4" href="/articles" { "See all" }
        }
        div."flex flex-col gap-6" {
            div."flex flex-col gap-2" {
                span."font-bold text-sm" { "Tags" }
                ul."m-0 flex list-none flex-wrap gap-1 p-0" {
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
            }
            div."flex flex-col gap-2" {
                span."font-bold text-sm" { "Years" }
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

fn blog_sidebar(
    ctx: &mut PageContext,
    current_tag: Option<&str>,
    current_year: Option<i32>,
) -> maud::Markup {
    html! {
        aside."hidden sm:block mr-4 grow-0 basis-1/5 sm:my-8" {
            div."top-4 mt-4 flex flex-col items-center gap-y-6 sm:sticky sm:mt-0 sm:items-start" {
                (blog_sidebar_content(ctx, current_tag, current_year))
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
pub struct BlogPostPageParams {
    pub slug: String,
}

impl Route<BlogPostPageParams> for BlogPostPage {
    fn pages(&self, context: &mut DynamicRouteContext) -> Pages<BlogPostPageParams> {
        context
            .content
            .get_source::<BlogPost>("blog")
            .into_pages(|entry| Page {
                params: BlogPostPageParams {
                    slug: entry.id.clone(),
                },
                props: (),
            })
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let params = ctx.params::<BlogPostPageParams>();

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

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts").unwrap();

        base_layout(
            Some("Articles".into()),
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
                            (blog_sidebar_content(ctx, None, None))
                        }
                    }
                }

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

                (PreEscaped(r#"<script>
                    document.addEventListener('DOMContentLoaded', () => {
                        // Mobile filter sidebar toggle
                        const filterToggle = document.getElementById('mobile-filter-toggle');
                        const filterSidebar = document.getElementById('mobile-filter-sidebar');
                        const filterClose = document.getElementById('mobile-filter-close');
                        const filterContent = filterSidebar?.querySelector('div > div');
                        let filterOpen = false;

                        function toggleFilterSidebar() {
                            filterOpen = !filterOpen;
                            
                            if (filterSidebar) {
                                filterSidebar.classList.toggle('opacity-0', !filterOpen);
                                filterSidebar.classList.toggle('opacity-100', filterOpen);
                                filterSidebar.classList.toggle('pointer-events-none', !filterOpen);
                            }
                            
                            if (filterContent) {
                                filterContent.classList.toggle('translate-x-full', !filterOpen);
                                filterContent.classList.toggle('translate-x-0', filterOpen);
                            }
                            
                            document.body.style.overflow = filterOpen ? 'hidden' : '';
                        }

                        if (filterToggle) {
                            filterToggle.addEventListener('click', toggleFilterSidebar);
                        }
                        
                        if (filterClose) {
                            filterClose.addEventListener('click', toggleFilterSidebar);
                        }
                        
                        // Close when clicking overlay
                        if (filterSidebar) {
                            filterSidebar.addEventListener('click', (e) => {
                                if (e.target === filterSidebar) {
                                    toggleFilterSidebar();
                                }
                            });
                        }
                    });
                </script>"#))
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

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts")?;

        Ok(base_layout(
            Some(format!("Articles tagged with {}", params.tag)),
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
                            (blog_sidebar_content(ctx, Some(&params.tag), None))
                        }
                    }
                }

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

        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts")?;

        Ok(base_layout(
            Some(format!("Articles from {}", params.year)),
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
                            (blog_sidebar_content(ctx, None, Some(params.year)))
                        }
                    }
                }

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
