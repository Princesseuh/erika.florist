use maudit::route::prelude::*;
use rss_gen::{RssData, RssItem, RssVersion, generate_rss};

use crate::{
    content::BlogPost,
    pages::{BlogPostPage, blog::BlogPostPageParams},
};

#[route("/rss/blog/index.xml")]
pub struct BlogRSS;

impl Route for BlogRSS {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let mut articles = ctx
            .content
            .get_source::<crate::content::BlogPost>("blog")
            .entries
            .iter()
            .filter(|e| !e.data(ctx).draft.unwrap_or(false))
            .collect::<Vec<_>>();

        articles.sort_by(|a, b| b.data(ctx).date.cmp(&a.data(ctx).date));

        let mut feed = RssData::new(Some(RssVersion::RSS2_0))
            .title("Erika Florist Blog")
            .link("https://erika.florist/blog")
            .description("Latest posts from Erika Florist");

        articles.iter().for_each(|post| {
            let data = post.data(ctx);
            feed.add_item(
                RssItem::new()
                    .title(&data.title)
                    .link(format!(
                        "/{}",
                        BlogPostPage.url(BlogPostPageParams {
                            slug: post.id.clone(),
                        })
                    ))
                    .description(data.tagline.clone().unwrap_or_default())
                    .pub_date(data.date.to_string()),
            );
        });

        generate_rss(&feed).unwrap_or_default()
    }
}
