use maud::{Markup, html};
use maudit::content::MarkdownHeading;

pub fn table_of_content(headings: &[MarkdownHeading], max_depth: Option<u32>) -> Markup {
    let headings = headings
        .iter()
        .filter(|h| h.level > 1 && h.level <= max_depth.unwrap_or(3) as u8)
        .collect::<Vec<_>>();

    html! {
        span."mb-2 font-medium" { "On this page" }
        nav."toc text-[0.95rem]" {
            ol {
                @for heading in headings {
                    li.(format!("toc-depth-{}", heading.level)) {
                        a href=(format!("#{}", heading.id)) { (heading.title) }
                    }
                }
            }
        }
    }
}
