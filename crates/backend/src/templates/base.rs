use erikaflorist::content::ContentSources;
use maud::{Markup, PreEscaped, html};

pub fn base_template(sources: &ContentSources, content: Markup, is_authenticated: bool) -> Markup {
    html! {
        head {
            meta charset="utf-8";
            meta name="viewport" content="width=device-width, initial-scale=1";
            title { "CMS - Erika" }
            link rel="stylesheet" href="/assets/prin.css";
            style {
                r#"
                @media (max-width: 768px) {
                    .mobile-sidebar {
                        position: fixed;
                        top: 0;
                        left: -100%;
                        width: 80%;
                        max-width: 280px;
                        height: 100vh;
                        z-index: 50;
                        transition: left 0.3s ease-in-out;
                    }
                    .mobile-sidebar.open {
                        left: 0;
                    }
                    .mobile-overlay {
                        display: none;
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.5);
                        z-index: 40;
                    }
                    .mobile-overlay.open {
                        display: block;
                    }
                }
                "#
            }
        }
        body {
            // Mobile menu button
            button #mobile-menu-btn.md:hidden.fixed.top-4.left-4.z-30.p-2.bg-gray-50.border.border-gray-200.rounded-md.shadow-sm {
                svg.w-6.h-6 xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                    path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" {}
                }
            }

            // Mobile overlay
            div #mobile-overlay.mobile-overlay {}

            div.flex.min-h-screen {
              (sidebar(sources, is_authenticated))
              main.flex-1.p-6.md:p-6.pt-16.md:pt-6.max-w-full.overflow-x-hidden {
                (content)
              }
            }

            script {
                (PreEscaped(r#"
                document.addEventListener('DOMContentLoaded', function() {
                    const menuBtn = document.getElementById('mobile-menu-btn');
                    const sidebar = document.getElementById('mobile-sidebar');
                    const overlay = document.getElementById('mobile-overlay');

                    if (menuBtn && sidebar && overlay) {
                        menuBtn.addEventListener('click', function() {
                            sidebar.classList.toggle('open');
                            overlay.classList.toggle('open');
                        });

                        overlay.addEventListener('click', function() {
                            sidebar.classList.remove('open');
                            overlay.classList.remove('open');
                        });
                    }
                });
                "#))
            }
        }
    }
}

fn sidebar(sources: &ContentSources, is_authenticated: bool) -> Markup {
    let all_sources: Vec<String> = sources
        .sources()
        .iter()
        .map(|s| s.get_name().to_string())
        .collect();

    let catalogue_items = ["books", "movies", "shows", "games"];
    let (catalogue_sources, other_sources): (Vec<_>, Vec<_>) = all_sources
        .iter()
        .partition(|name| catalogue_items.contains(&name.as_str()));

    html! {
        aside #mobile-sidebar.mobile-sidebar.w-64.bg-gray-50.border-r.border-gray-200.p-4.md:relative.md:left-0 {
            nav {
                ul.space-y-2 {
                    @for name in &other_sources {
                        li {
                            a.block.px-3.py-2.rounded-md.text-gray-700.hover:bg-gray-100.hover:text-gray-900.transition-colors href=(format!("/{}", name)) { (capitalize_first(name)) }
                        }
                    }

                    @if !catalogue_sources.is_empty() {
                        li.mt-6 {
                            div.flex.items-center.justify-between.px-3.py-1 {
                                h3.text-sm.font-medium.text-gray-500.uppercase.tracking-wide { "Catalogue" }
                                a.w-6.h-6.flex.items-center.justify-center.text-lg.font-bold.text-gray-600.hover:text-gray-900.hover:bg-gray-200.rounded.transition-colors href="/catalogue/add" title="Add catalogue item" {
                                    "+"
                                }
                            }
                        }
                        @for name in &catalogue_sources {
                            li {
                                a.block.px-3.py-2.rounded-md.text-gray-700.hover:bg-gray-100.hover:text-gray-900.transition-colors href=(format!("/catalogue/{}", name)) { (capitalize_first(name)) }
                            }
                        }
                    }

                    li.mt-6.pt-4.border-t.border-gray-200 {
                        @if is_authenticated {
                            div.space-y-2 {
                                span.block.px-3.py-2.text-sm.text-gray-500 { "Logged in" }
                                a.block.px-3.py-2.rounded-md.text-red-600.hover:bg-red-50.hover:text-red-700.transition-colors href="/logout" { "Sign out" }
                            }
                        } @else {
                            a.block.px-3.py-2.rounded-md.text-gray-700.hover:bg-gray-100.hover:text-gray-900.transition-colors href="/login" { "Login" }
                        }
                    }
                }
            }
        }
    }
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}
