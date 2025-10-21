use maud::{Markup, PreEscaped, html};
use maudit::route::PageContext;

use crate::components::logo::logo;

pub fn header(include_about: bool, purple: bool, ctx: &mut PageContext) -> Markup {
    ctx.assets.include_script("src/assets/mobile-menu.ts");

    let menu = ["articles", "projects", "wiki", "catalogue"];

    let button_class = if purple {
        "button-style-bg-violet"
    } else {
        "button-style-bg-accent"
    };

    html! {
        header."relative sm:min-h-[125px] p-2 px-3 sm:p-4 sm:flex xl:grid xl:grid-cols-(--grid-cols-header-xl) text-white-sugar-cane".(if purple { "bg-violet-ultra" } else { "bg-accent-valencia" }) {
            // Mobile header with hamburger
            div."flex justify-between items-center sm:hidden w-full" {
                (logo())
                div.md:hidden.flex.align-middle.justify-center.items-center {
                    button id="mobile-menu-button" aria-label="Toggle main menu" {
                        span id="hamburger-icon" {
                            (PreEscaped(include_str!("../assets/hamburger.svg")))
                        }
                        span id="close-icon" .hidden {
                            (PreEscaped(include_str!("../assets/close.svg")))
                        }
                    }
                }
            }

            // Desktop header (hidden on mobile)
            section."hidden sm:block text-white-sugar-cane xl:basis-2/3" {
                (logo())
                @if include_about {
                    section."hidden sm:block text-sm" {
                        "Often found in high-impact, yet overlooked areas, such as editor tooling or error handling. Currently working on "
                        a.(button_class).p-0 href="https://astro.build" { "Astro" }
                        " and "
                        a.(button_class).p-0 href="https://maudit.org" { "Maudit" }
                        "."
                    }
                }
            }
            section."hidden sm:flex mx-auto w-centered-width items-center justify-end" {
                section."grid h-min grid-cols-2 gap-x-10 justify-self-end text-xl font-[550]" {
                    @for item in menu.iter() {
                        a class="bg-transparent p-1 tracking-wider".(button_class).(if *item == "wiki" {"hover:text-violet-ultra"} else {""}) href=(format!("/{}", item)) {
                            (item)
                        }
                    }
                }
            }
        }

        // Mobile menu panel
        div id="mobile-menu-panel" .fixed.left-0.w-full.transform."-translate-x-4"."transition-all".opacity-0.pointer-events-none."z-50".(if purple { "bg-violet-ultra" } else { "bg-accent-valencia" }) style="top: 65px; bottom: 0;" {
            nav {
                @for item in &menu {
                    a class="block text-2xl font-medium text-white-sugar-cane px-4 py-4 border-b border-white-sugar-cane/20 text-right" href=(format!("/{}", item)) { (item) }
                }
            }
            @if include_about {
                div class="px-6 py-8" {
                    p class="text-md text-white-sugar-cane/80" {
                        "Often found in high-impact, yet overlooked areas, such as editor tooling or error handling. Currently working on "
                        a.(button_class).p-0.sm:p-1 href="https://astro.build" { "Astro" }
                        " and "
                        a.(button_class).p-0.sm:p-1 href="https://maudit.org" { "Maudit" }
                        "."
                    }
                }
            }
        }
    }
}
