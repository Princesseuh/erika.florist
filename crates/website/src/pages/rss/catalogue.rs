use maudit::route::prelude::*;
use xml_builder::{XMLBuilder, XMLElement, XMLVersion};

use crate::content::CatalogueEntry;

#[route("/rss/catalogue/index.xml")]
pub struct CatalogueRSS;

impl Route for CatalogueRSS {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let games = &ctx
            .content
            .get_source::<crate::content::CatalogueGame>("games");
        let movies = &ctx
            .content
            .get_source::<crate::content::CatalogueMovie>("movies");
        let books = &ctx
            .content
            .get_source::<crate::content::CatalogueBook>("books");
        let shows = &ctx
            .content
            .get_source::<crate::content::CatalogueShow>("shows");

        let combined_entries: Vec<CatalogueEntry> = games
            .entries
            .iter()
            .map(|g| CatalogueEntry::Game(g.clone()))
            .chain(
                movies
                    .entries
                    .iter()
                    .map(|m| CatalogueEntry::Movie(m.clone())),
            )
            .chain(
                books
                    .entries
                    .iter()
                    .map(|b| CatalogueEntry::Book(b.clone())),
            )
            .chain(
                shows
                    .entries
                    .iter()
                    .map(|s| CatalogueEntry::Show(s.clone())),
            )
            .collect();

        let mut sorted_entries = combined_entries;
        sorted_entries.sort_by(|a, b| {
            let a_date = a.finished_date(ctx);
            let b_date = b.finished_date(ctx);
            b_date.cmp(&a_date)
        });

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
        title.add_text("Erika's Catalogue".to_string())?;
        channel.add_child(title)?;

        let mut link = XMLElement::new("link");
        link.add_text("https://erika.florist/catalogue".to_string())?;
        channel.add_child(link)?;

        let mut description = XMLElement::new("description");
        description.add_text("Latest items from erika.florist catalogue".to_string())?;
        channel.add_child(description)?;

        let mut atom_link = XMLElement::new("atom:link");
        atom_link.add_attribute("href", "https://erika.florist/rss/catalogue/index.xml");
        atom_link.add_attribute("rel", "self");
        atom_link.add_attribute("type", "application/rss+xml");
        channel.add_child(atom_link)?;

        for entry in sorted_entries.iter() {
            let item = entry.as_xml_element(ctx)?;
            channel.add_child(item)?;
        }

        rss.add_child(channel)?;
        xml.set_root_element(rss);

        let mut writer = Vec::new();
        xml.generate(&mut writer)?;

        let result = String::from_utf8(writer)?;

        Ok(result)
    }
}
