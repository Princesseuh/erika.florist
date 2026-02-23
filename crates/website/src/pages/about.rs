use maud::{Markup, PreEscaped, html};
use maudit::{
    content::{HighlightOptions, highlight_code},
    route::prelude::*,
};

use crate::{
    components::icon::{Icon, icon},
    components::{article_preview, dinkus, mobile_menu_button},
    content::BlogPost,
    layouts::base_layout,
};

fn colour_swatch(name: &str, hex: &str) -> Markup {
    html! {
        div {
            div."h-16 rounded-sm mb-2 border border-black-charcoal/10" style=(format!("background-color: {};", hex)) {}
            p."text-sm font-semibold" { (name) }
            p."text-sm text-subtle-charcoal font-mono" { (hex) }
        }
    }
}

#[route("/about/")]
pub struct AboutPage;

impl Route for AboutPage {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let rust_sample = highlight_code(
            "fn main() {\n    println!(\"Hello, world!\");\n}",
            &HighlightOptions::new("rust", "base16-ocean.dark"),
        )
        .unwrap_or_default();

        let articles = ctx.content.get_source::<BlogPost>("blog");
        let featured = articles
            .entries
            .iter()
            .find(|e| e.data(ctx).featured.unwrap_or(false));
        let regular = articles
            .entries
            .iter()
            .find(|e| !e.data(ctx).featured.unwrap_or(false));
        base_layout(
            Some("About".into()),
            Some("Design system and style guide for erika.florist.".into()),
            html!(
                div."container mx-auto my-8 px-4 max-w-centered-width" {
                    h2."text-3xl font-semibold mb-2" { "Design" }

                    // Colours
                    section."mb-12" {
                        h2."text-xl font-semibold mb-4" { "Colours" }
                        div."grid grid-cols-2 sm:grid-cols-3 gap-4" {
                            (colour_swatch("accent-valencia", "#c73c2e"))
                            (colour_swatch("violet-ultra", "#52489c"))
                            (colour_swatch("orange-carrot", "#f9a03f"))
                            (colour_swatch("white-sugar-cane", "#f7f7f7"))
                            (colour_swatch("black-charcoal", "#0a0908"))
                            (colour_swatch("subtle-charcoal", "#4d4d4d"))
                        }
                    }

                    // Typography
                    section."mb-12" {
                        h3."text-xl font-semibold mb-4" { "Typography" }
                        div."space-y-6" {
                            // Headings
                            div."p-4 border border-black-charcoal/10 rounded-sm" {
                                p."text-xs text-subtle-charcoal font-mono mb-3" { "Inter Variable · headings" }
                                h1."text-4xl font-bold leading-tight" { "Heading 1" }
                                h2."text-3xl font-semibold leading-tight" { "Heading 2" }
                                h3."text-2xl font-semibold leading-tight" { "Heading 3" }
                                h4."text-xl font-semibold leading-tight" { "Heading 4" }
                            }
                            // Body
                            div."p-4 border border-black-charcoal/10 rounded-sm" {
                                p."text-xs text-subtle-charcoal font-mono mb-3" { "IBM Plex · body" }
                                p."text-base mb-2" {
                                    "Regular body text. Often found in high-impact, yet overlooked areas, "
                                    "such as editor tooling or error handling."
                                }
                                p."text-sm text-subtle-charcoal" {
                                    "Secondary text. Used for metadata, captions, and dates. e.g. "
                                    (regular.or(featured).map(|e| {
                                        let data = e.data(ctx);
                                        let date = data.date.format("%b %d, %Y").to_string();
                                        let tags = data.tags.join(", ");
                                        format!("{} · {}", date, tags)
                                    }).unwrap_or_default())
                                }
                            }
                            // Monospace
                            div."p-4 border border-black-charcoal/10 rounded-sm" {
                                p."text-xs text-subtle-charcoal font-mono mb-3" { "system-ui monospace · code" }
                                code."text-sm bg-black-charcoal text-white-sugar-cane px-2 py-1 rounded" {
                                    "inline code sample"
                                }
                            }
                        }
                    }

                    // Buttons / Components
                    section."mb-12" {
                        h3."text-xl font-semibold mb-4" { "Components" }

                        // Buttons
                        div."mb-6" {
                            h3."text-base font-semibold mb-3 text-subtle-charcoal" { "Buttons" }
                            div."flex flex-wrap gap-4 items-start" {
                                div."flex flex-col gap-1 items-start" {
                                    a.button-style-bg-accent."px-3 py-1 text-sm" href="#" { "button-style-bg-accent" }
                                    p."text-xs text-subtle-charcoal font-mono" { ".button-style-bg-accent" }
                                }
                                div."flex flex-col gap-1 items-start" {
                                    a.button-style-bg-violet."px-3 py-1 text-sm" href="#" { "button-style-bg-violet" }
                                    p."text-xs text-subtle-charcoal font-mono" { ".button-style-bg-violet" }
                                }
                            }
                        }

                        // Prose links
                        div."mb-6" {
                            h3."text-base font-semibold mb-3 text-subtle-charcoal" { "Prose links" }
                            div."flex flex-wrap gap-6" {
                                div."prose" {
                                    p { a href="#" { "example link" } }
                                }
                                div."prose-violet" {
                                    p { a href="#" { "example link" } }
                                }
                            }
                        }

                        // Blockquote
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Blockquote" }
                            div."flex flex-col gap-4" {
                                div."prose" {
                                    blockquote {
                                        p { "Red blockquote, used in articles. Main accent border with a transparent accent tint." }
                                    }
                                }
                                div."prose-violet" {
                                    blockquote {
                                        p { "Violet blockquote, used in the wiki. Violet border with a transparent violet tint." }
                                    }
                                }
                            }
                        }

                        // Code block
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Code block" }
                            div."prose" {
                                pre data-language="rust" { code data-language="rust" { (PreEscaped(&rust_sample)) } }
                            }
                        }

                        // Dinkus
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Dinkus" }
                            div."border border-black-charcoal/10 rounded-sm p-4 prose" {
                                p { "The dinkus is used as a thematic break between sections of prose content." }
                                (dinkus(None))
                                p { "It signals a scene change or shift in perspective without using a heading." }
                            }
                        }

                        // Article preview
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Article preview" }
                            div."flex flex-col gap-4" {
                                @if let Some(entry) = featured {
                                    div."flex flex-col gap-1" {
                                        p."text-xs text-subtle-charcoal font-mono mb-2" { "featured" }
                                        (article_preview(entry, ctx))
                                    }
                                }
                                @if let Some(entry) = regular {
                                    div."flex flex-col gap-1" {
                                        p."text-xs text-subtle-charcoal font-mono mb-2" { "regular" }
                                        (article_preview(entry, ctx))
                                    }
                                }
                            }
                        }

                        // Mobile menu button
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Mobile menu button" }
                            div."flex items-center justify-center" {
                                div."relative w-14 h-14" {
                                    (mobile_menu_button("about-preview", "", Icon::Menu))
                                }
                            }
                        }

                        // Icons
                        div."mb-6" {
                            h4."text-base font-semibold mb-3 text-subtle-charcoal" { "Icons" }
                            div."flex flex-wrap gap-6" {
                                @for (variant, name) in [
                                    (Icon::Github, "github"),
                                    (Icon::Mail, "mail"),
                                    (Icon::Bluesky, "bluesky"),
                                    (Icon::Menu, "menu"),
                                    (Icon::ArrowUp, "arrow-up"),
                                    (Icon::Hamburger, "hamburger"),
                                    (Icon::Close, "close"),
                                    (Icon::Toc, "toc"),
                                    (Icon::Search, "search"),
                                ] {
                                    div."flex flex-col items-center gap-2" {
                                        (icon(variant, 24, name))
                                        p."text-xs text-subtle-charcoal font-mono" { (name) }
                                    }
                                }
                            }
                        }
                    }
                }
            ),
            true,
            None,
            ctx,
        )
    }
}
