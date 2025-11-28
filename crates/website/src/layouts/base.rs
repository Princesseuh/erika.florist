use maud::{DOCTYPE, Markup, html};
use maudit::{assets::StyleOptions, maud::generator};

use crate::components::{dinkus, header, socials, spritesheet};

pub fn base_layout(
    title: Option<&str>,
    description: Option<&str>,
    content: Markup,
    include_about: bool,
    ctx: &mut maudit::route::PageContext,
) -> Markup {
    let title = title.unwrap_or("Erika");
    let description = description.unwrap_or("My personal website");

    ctx.assets
        .include_style_with_options("src/prin.css", StyleOptions { tailwind: true });

    ctx.assets.include_script("src/assets/main.ts");

    let purple = ctx.current_path.starts_with("/wiki");

    let button_class = if purple {
        "button-style-bg-violet"
    } else {
        "button-style-bg-accent"
    };

    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                meta name="description" content=(description);
                title { (title) }
                (generator())
                link rel="icon" type="image/svg+xml" href="/favicon.svg";
                meta name="description" content=(description);
                meta property="og:title" content=(title);
                meta property="og:description" content=(description);

                meta property="og:type" content="website";
                meta property="og:site_name" content="erika.florist";

                link rel="alternate" type="application/rss+xml" title="Blog" href="https://erika.florist/rss/blog/";
                link rel="alternate" type="application/rss+xml" title="Catalogue" href="https://erika.florist/rss/catalogue/";

                meta name="twitter:card" content="summary";
            }
            body.bg-black-charcoal {
                div.bg-white-sugar-cane id="app" {
                    (header(include_about, purple, ctx))

                    main {
                        (content)
                    }

                    footer."flex justify-center bg-black-charcoal px-5 py-6 pb-12 leading-tight text-white-sugar-cane sm:m-0 sm:px-0 sm:pb-6" {
                        section."flex w-centered-width flex-wrap items-center justify-between gap-y-8" {
                            (socials(None, None))

                            (dinkus(Some("fill-white-sugar-cane hidden sm:block")))

                            div.leading-6 {
                                "Powered by " a.(button_class).py-0 href="https://maudit.org" target="_blank" { "Maudit" }
                                br;
                                a.(button_class).py-0 target="_blank" href="https://github.com/Princesseuh/erika.florist" { "Source Code" }
                                br;
                                a.(button_class).py-0 href="/changelog/" { "Changelog" }
                            }
                        }
                    }
                    (spritesheet())
                }
            }
        }
    }
}
