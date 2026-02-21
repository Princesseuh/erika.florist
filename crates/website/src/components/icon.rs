use std::fmt::Display;

use maud::{Markup, html};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Icon {
    Github,
    Mail,
    Bluesky,
    Menu,
    ArrowUp,
    Hamburger,
    Close,
    Toc,
    Search,
}

impl Display for Icon {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Icon::Github => "github",
            Icon::Mail => "mail",
            Icon::Bluesky => "bluesky",
            Icon::Menu => "menu",
            Icon::ArrowUp => "arrow-up",
            Icon::Hamburger => "hamburger",
            Icon::Close => "close",
            Icon::Toc => "toc",
            Icon::Search => "search",
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
