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
                div."container mx-auto my-8 px-4 max-w-4xl" {
                    h1."text-3xl font-semibold mb-2" { "Friends" }
                    p."text-subtle-charcoal mb-8" { "Sites I like and link to. The graph below shows how we're all connected." }

                    // graph-garden web component
                    (maud::PreEscaped(r#"<script type="module" src="https://unpkg.com/graphgarden-web"></script>"#))
                    graph-garden
                        style="width: 100%; height: 500px; display: block;"
                        node-size="5"
                        label-size="13"
                        iterations="300"
                    {}
                }
            ),
            true,
            ctx,
        )
    }
}
