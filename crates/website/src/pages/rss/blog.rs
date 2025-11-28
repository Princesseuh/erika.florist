use maudit::route::prelude::*;
use xml_builder::{XMLBuilder, XMLElement, XMLVersion};

use crate::content::BlogPost;
use crate::rss::IntoXMLElement;

#[route("/rss/blog/index.xml")]
pub struct BlogRSS;

impl Route for BlogRSS {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let mut articles = ctx
            .content
            .get_source::<BlogPost>("blog")
            .entries
            .iter()
            .filter(|e| !e.data(ctx).draft.unwrap_or(false))
            .collect::<Vec<_>>();

        articles.sort_by(|a, b| b.data(ctx).date.cmp(&a.data(ctx).date));

        let mut xml = XMLBuilder::new()
            .version(XMLVersion::XML1_0)
            .encoding("UTF-8".into())
            .build();

        let mut rss = XMLElement::new("rss");
        rss.add_attribute("version", "2.0");
        rss.add_attribute("xmlns:atom", "http://www.w3.org/2005/Atom");
        rss.add_attribute("xmlns:content", "http://purl.org/rss/1.0/modules/content/");

        let mut channel = XMLElement::new("channel");

        let mut title = XMLElement::new("title");
        title.add_text("Erika's blog".to_string())?;
        channel.add_child(title)?;

        let mut link = XMLElement::new("link");
        link.add_text("https://erika.florist/articles".to_string())?;
        channel.add_child(link)?;

        let mut description = XMLElement::new("description");
        description.add_text("Latest posts from erika.florist".to_string())?;
        channel.add_child(description)?;

        let mut atom_link = XMLElement::new("atom:link");
        atom_link.add_attribute("href", "https://erika.florist/rss/blog/index.xml");
        atom_link.add_attribute("rel", "self");
        atom_link.add_attribute("type", "application/rss+xml");
        channel.add_child(atom_link)?;

        for post in articles.iter() {
            channel.add_child(post.as_xml_element(ctx)?)?;
        }

        rss.add_child(channel)?;
        xml.set_root_element(rss);

        let mut writer = Vec::new();
        xml.generate(&mut writer)?;

        let result = String::from_utf8(writer)?;

        Ok(result)
    }
}
