use maud::{Markup, html};
use maudit::{
    content::Entry,
    route::{PageContext, RouteExt},
};

use crate::{
    content::{Project, has_project_page},
    pages::{ProjectPage, ProjectPageParams},
};

const CARD_LINK: &str = "text-accent-valencia hover:bg-accent-valencia hover:text-white-sugar-cane font-[450] group-focus-within:text-white-sugar-cane group-focus-within:focus:text-black-charcoal group-hover:text-white-sugar-cane group-hover:hover:bg-white-sugar-cane group-hover:hover:text-accent-valencia";
const ACCENT_LINK: &str =
    "text-white-sugar-cane font-[450] hover:bg-white-sugar-cane hover:text-accent-valencia";

fn link_class(on_accent: bool) -> &'static str {
    if on_accent { ACCENT_LINK } else { CARD_LINK }
}

/// `skip` drops the URL the title already points at, so no card shows one destination twice.
pub fn project_meta(
    entry: &Entry<Project>,
    ctx: &mut PageContext,
    skip: Option<&str>,
    on_accent: bool,
) -> Markup {
    let data = entry.data(ctx);
    let class = link_class(on_accent);

    let mut links: Vec<(String, &str)> = Vec::new();
    if let Some(org) = data.org {
        links.push((org.url().to_string(), org.label()));
    }
    for (url, label) in [
        (data.external_url.as_deref(), "Website"),
        (data.repository_url.as_deref(), "Source"),
    ] {
        if let Some(url) = url
            && Some(url) != skip
        {
            links.push((url.to_string(), label));
        }
    }

    html! {
        (data.r#type.label())
        @if let Some(role) = data.role {
            " · " (role.label())
        }
        @if data.archived.unwrap_or(false) {
            " · " "No longer maintained"
        }
        @if !links.is_empty() {
            " · "
            span data-graphgarden-ignore="" {
                @for (i, (url, label)) in links.iter().enumerate() {
                    a.(class) href=(url) { (label) }
                    @if i < links.len() - 1 {
                        ", "
                    }
                }
            }
        }
    }
}

pub fn project_card(entry: &Entry<Project>, ctx: &mut PageContext) -> Markup {
    let data = entry.data(ctx);
    let featured = data.featured.unwrap_or(false);
    let archived = data.archived.unwrap_or(false);

    let own_page = ProjectPage.url(ProjectPageParams {
        slug: entry.id.clone(),
    });
    let target = if has_project_page(entry) {
        own_page
    } else {
        data.external_url
            .clone()
            .or_else(|| data.repository_url.clone())
            .unwrap_or(own_page)
    };

    let type_slug = data.r#type.slug();
    let role_slug = data.role.map(|role| role.slug()).unwrap_or("");
    let tagline = data.tagline.clone();

    let surface = if featured {
        "bg-orange-carrot/8"
    } else if archived {
        "border border-solid border-black-charcoal/10"
    } else {
        "border border-solid border-accent-valencia/10"
    };

    let dimmed = if archived {
        "opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100"
    } else {
        ""
    };

    html! {
        section.(surface).(dimmed)."group w-fit break-inside-avoid hyphens-auto p-6 focus-within:bg-accent-valencia focus-within:text-white-sugar-cane hover:bg-accent-valencia hover:text-white-sugar-cane sm:hyphens-none"
            data-project-type=(type_slug) data-project-role=(role_slug) {
            a."flex flex-col gap-y-1" href=(target) {
                h2.(if featured {"text-4.5xl leading-none"} else {"text-3xl leading-somewhat-tight"}).(if archived {"text-subtle-charcoal"} else {"text-accent-valencia"})."m-0 break-words p-0 tracking-somewhat-tight group-focus-within:text-white-sugar-cane group-hover:text-white-sugar-cane sm:break-normal" {
                    (data.title)
                }
                @if let Some(tagline) = tagline {
                    span."pb-1 pt-1 font-medium leading-tight text-black-charcoal group-focus-within:text-white-sugar-cane group-hover:text-white-sugar-cane" {
                        (tagline)
                    }
                }
            }
            section."text-sm" {
                (project_meta(entry, ctx, Some(&target), false))
            }
        }
    }
}
