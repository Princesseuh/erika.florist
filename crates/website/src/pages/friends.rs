use maud::html;
use maudit::route::prelude::*;

use crate::layouts::base_layout;

#[route("/friends/")]
pub struct FriendsPage;

impl Route for FriendsPage {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        base_layout(
            Some("Friends".into()),
            Some("Sites I like and link to.".into()),
            html!(
                div class="relative h-[calc(100vh-213px)] md:h-[calc(100vh-255px)]" {
                    // graph-garden web component
                    (maud::PreEscaped(r#"<script type="module" src="https://unpkg.com/graphgarden-web"></script>"#))
                    graph-garden
                        style="width: 100%; height: 100%; display: block;"
                        node-size="5"
                        label-size="13"
                        iterations="300"
                    {}
                    div style="position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); font-size: 0.75rem;" class="text-subtle-charcoal" {
                        a href="https://github.com/bruits/graphgarden" target="_blank" class="text-subtle-charcoal hover:text-black-charcoal" { "Powered by graphgarden" }
                    }
                }
            ),
            true,
            None,
            ctx,
        )
    }
}
