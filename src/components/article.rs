use maud::{Markup, html};
use maudit::{content::Entry, route::PageContext};

use crate::{components::tags, content::BlogPost};

pub fn article_preview(entry: &Entry<BlogPost>, ctx: &mut PageContext) -> Markup {
    let data = entry.data(ctx);

    html! {
        @let featured = data.featured.unwrap_or(false);
        section.(if featured {"bg-orange-carrot/8"} else {"border border-solid border-accent-valencia/10"})."group absolute w-full break-inside-avoid hyphens-auto p-6 focus-within:bg-accent-valencia focus-within:text-white-sugar-cane hover:bg-accent-valencia hover:text-white-sugar-cane sm:hyphens-none" {
            a."flex flex-col gap-y-1" href=(format!("/articles/{}#title", entry.id)) {
                h2.(if featured {"text-4.5xl leading-none"} else {"text-3xl leading-somewhat-tight"})."m-0 break-words p-0 tracking-somewhat-tight text-accent-valencia group-focus-within:text-white-sugar-cane group-hover:text-white-sugar-cane sm:break-normal" {
                    (data.title)
                    // TODO: Show draft status
                }

                span."pb-1 pt-1 font-medium leading-tight text-black-charcoal group-focus-within:text-white-sugar-cane group-hover:text-white-sugar-cane" {
                    (data.tagline.as_deref().unwrap_or(""))
                }
            }
            section."text-sm" {
                (data.date.format("%b %d, %Y"))
                (tags(&data.tags, None))
            }
        }
    }
}
