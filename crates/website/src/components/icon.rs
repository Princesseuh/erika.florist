use std::fmt::Display;

use maud::{Markup, html};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Icon {
    Github,
    Mail,
    Bluesky,
    System,
    Menu,
    Moon,
    Sun,
    ArrowUp,
}

impl Display for Icon {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Icon::Github => "github",
            Icon::Mail => "mail",
            Icon::Bluesky => "bluesky",
            Icon::System => "system",
            Icon::Menu => "menu",
            Icon::Moon => "moon",
            Icon::Sun => "sun",
            Icon::ArrowUp => "arrow-up",
        };
        write!(f, "{}", name)
    }
}

pub fn icon(name: Icon, size: usize, title: &str) -> Markup {
    html! {
            svg width=(format!("{}px", size)) height=(format!("{}px", size)) {
                title { (title) }
                use xlink:href=(format!("#icon:{}", name)) width=(format!("{}px", size)) height=(format!("{}px", size));
        }
    }
}
