use maud::{PreEscaped, html};
use maudit::{
    content::{Entry, MarkdownContent},
    route::RenderResult,
};

use crate::{
    components::{table_of_content, tags},
    content::BlogPost,
    layouts::base_layout,
};

pub fn article_layout(
    article: &Entry<BlogPost>,
    include_about: bool,
    ctx: &mut maudit::route::PageContext,
) -> impl Into<RenderResult> {
    ctx.assets.include_script("src/assets/article.ts")?;
    let article_data = article.data(ctx);

    let has_sidenotes = false;

    let content = html!(
        header."mb-6 mt-0 bg-accent-valencia text-white-sugar-cane" #title {
            div.(if has_sidenotes { "lg:ml-3/4 md:w-3/4 xl:w-auto" } else {""})."mx-4" { // TODO: Sidenotes
                div."mx-auto w-centered-width py-8 sm:py-12" {
                    h1."my-0 hyphens-auto text-5xl sm:hyphens-none sm:text-6xl" { (article_data.title) }
                    @if let Some(tagline) = &article_data.tagline {
                        h2."m-0 mt-4 text-xl" { (tagline) }
                    }
                    div {
                        (article_data.date)
                        (tags(&article_data.tags, Some(true)))
                    }
                }
            }
        }

        section.(if has_sidenotes {"md:grid-cols-(--grid-cols-layout-tablet-sidenote)"} else {"md:grid-cols-(--grid-cols-layout-tablet)"})."md:grid gap-x-4 lg:gap-x-0 xl:grid-cols-(--grid-cols-layout)" {
            aside."hidden px-4 transition-opacity duration-100 ease-linear hover:opacity-100 xl:mr-0 xl:block" {
                @if !article_data.get_headings().is_empty() {
                    (table_of_content(article_data.get_headings(), Some(3)))
                }
            }


            article."prose relative mx-auto w-centered-width px-4 xl:px-0 mb-12" {
                (PreEscaped(article.render(ctx)))
            }
        }
    );

    Ok(base_layout(
        Some(article_data.title.clone()),
        article_data.tagline.clone(),
        content,
        include_about,
        ctx,
    ))
}
