use maud::html;

use crate::components::icon::{Icon, icon};

pub fn socials(classes: Option<&str>, size: Option<usize>) -> maud::Markup {
    let classes = format!("flex items-center {}", classes.unwrap_or(""));
    let size = size.unwrap_or(26);

    html!(
        div class=(classes) {
            a rel="me" href="https://bsky.app/profile/erika.florist" title="Link to my Bluesky profile" class="social-icon social-bluesky" {
                (icon(Icon::Bluesky, size, "Bluesky"))
            }

            a href="https://github.com/Princesseuh" title="Link to my GitHub profile" class="social-icon social-github" {
                (icon(Icon::Github, size, "GitHub"))
            }

            a href="mailto:contact@erika.florist" title="Send me an email" class="social-icon social-mail mr-0" {
                (icon(Icon::Mail, size, "Email"))
            }
        }
    )
}
