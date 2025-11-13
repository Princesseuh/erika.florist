use erikaflorist::content::ContentSources;
use maud::{Markup, html};

pub fn base_template(sources: &ContentSources, content: Markup) -> Markup {
    html! {
        head {
            meta charset="utf-8";
            meta name="viewport" content="width=device-width, initial-scale=1";
            title { "CMS - Erika" }
            link rel="stylesheet" href="/assets/prin.css";
        }
        body {
            div.flex.min-h-screen {
              (sidebar(sources))
              main.flex-1.p-6 {
                (content)
              }
            }
        }
    }
}

fn sidebar(sources: &ContentSources) -> Markup {
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
        aside.w-64.bg-gray-50.border-r.border-gray-200.p-4 {
            nav {
                ul.space-y-2 {
                    @for name in &other_sources {
                        li {
                            a.block.px-3.py-2.rounded-md.text-gray-700.hover:bg-gray-100.hover:text-gray-900.transition-colors href=(format!("/{}", name)) { (capitalize_first(name)) }
                        }
                    }

                    @if !catalogue_sources.is_empty() {
                        li.mt-6 {
                            h3.px-3.py-1.text-sm.font-medium.text-gray-500.uppercase.tracking-wide { "Catalogue" }
                        }
                        @for name in &catalogue_sources {
                            li {
                                a.block.px-3.py-2.rounded-md.text-gray-700.hover:bg-gray-100.hover:text-gray-900.transition-colors href=(format!("/catalogue/{}", name)) { (capitalize_first(name)) }
                            }
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
