use chrono::NaiveDate;
use maudit::{content::markdown_entry, route::prelude::*};
use serde::Serialize;
use xml_builder::XMLElement;

use crate::{
    pages::{BlogPostPage, BlogPostPageParams},
    rss::{AsXMLError, IntoXMLElement, XMLElementExt, rewrite_rss_content},
};

#[derive(Debug, Serialize)]
#[markdown_entry]
pub struct BlogPost {
    pub title: String,
    pub tagline: Option<String>,
    pub max_depth_toc: Option<u32>,
    pub featured: Option<bool>,
    pub date: NaiveDate,
    pub tags: Vec<String>,
    pub draft: Option<bool>,
}

impl IntoXMLElement<BlogPost> for Entry<BlogPost> {
    fn as_xml_element(&self, ctx: &mut PageContext) -> Result<XMLElement, AsXMLError> {
        let data = self.data(ctx);
        let post_url = format!(
            "https://erika.florist{}",
            BlogPostPage.url(BlogPostPageParams {
                slug: self.id.clone(),
            })
        );

        let mut item = XMLElement::new("item");

        let mut item_title = XMLElement::new("title");
        item_title.add_escaped_text(&data.title)?;
        item.add_child(item_title)?;

        let mut item_link = XMLElement::new("link");
        item_link.add_escaped_text(&post_url)?;
        item.add_child(item_link)?;

        let mut guid = XMLElement::new("guid");
        guid.add_attribute("isPermaLink", "true");
        guid.add_escaped_text(&post_url)?;
        item.add_child(guid)?;

        let mut pub_date = XMLElement::new("pubDate");
        // Format date as RFC 2822
        let formatted_date = data.date.format("%a, %d %b %Y 00:00:00 +0000").to_string();
        pub_date.add_escaped_text(&formatted_date)?;
        item.add_child(pub_date)?;

        if let Some(tagline) = &data.tagline {
            let mut item_description = XMLElement::new("description");
            item_description.add_escaped_text(tagline)?;
            item.add_child(item_description)?;
        }

        // Add full content with absolute URLs
        let rendered_content = self.render(ctx);
        let content = rewrite_rss_content(&rendered_content)?;

        let mut content_encoded = XMLElement::new("content:encoded");
        content_encoded.add_cdata(&content)?;
        item.add_child(content_encoded)?;

        Ok(item)
    }
}
