use std::collections::HashMap;

use maud::{html, Markup, PreEscaped};

use crate::components::icon::Icon;

pub fn spritesheet() -> Markup {
    // hashmap of icon names to their SVG content
    let icons = HashMap::from([
        (Icon::Github, include_str!("../icons/github.svg")),
        (Icon::Mail, include_str!("../icons/mail.svg")),
        (Icon::Mastodon, include_str!("../icons/mastodon.svg")),
        (Icon::System, include_str!("../icons/system.svg")),
        (Icon::Menu, include_str!("../icons/menu.svg")),
        (Icon::Moon, include_str!("../icons/moon.svg")),
        (Icon::Sun, include_str!("../icons/sun.svg")),
        (Icon::ArrowUp, include_str!("../icons/arrow-up.svg")),
    ]);

    let icon_symbols: Vec<Markup> = icons.iter().map(|(icon, svg_content)| {
        let icon_name = format!("icon:{}", icon);

        html! {
            symbol xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" id=(icon_name) viewBox="0 0 24 24" aria-hidden="true" {
                (PreEscaped(svg_content))
            }
        }
    }).collect();

    html! {
        svg style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true" {
            @for symbol in icon_symbols {
                (symbol)
            }
        }
    }
}
