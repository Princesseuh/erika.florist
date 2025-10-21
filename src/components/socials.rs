use maud::html;

use crate::components::icon::{icon, Icon};

pub fn socials(classes: Option<&str>, size: Option<usize>) -> maud::Markup {
    let classes = format!("flex items-center {}", classes.unwrap_or(""));
    let size = size.unwrap_or(26);

    html!(
        div class=(classes) {
            a rel="me" href="https://mastodon.social/@erika" title="Link to my Mastodon profile" class="social-icon social-mastodon" {
                (icon(Icon::Mastodon, size, "Mastodon"))
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
