use std::{fmt::Display, sync::Arc};

use chrono::NaiveDate;
use maudit::{
    assets::{Asset, ImageFormat, ImageOptions},
    content::{
        ContentContext, ContentEntry, Entry, MarkdownOptions, parse_markdown_with_frontmatter,
        render_markdown,
    },
    route::PageContext,
};
use serde::{Deserialize, Deserializer, de::DeserializeOwned};
use xml_builder::XMLElement;

use crate::{
    content::{CatalogueBook, CatalogueGame, CatalogueMovie, CatalogueShow},
    rss::{AsXMLError, rewrite_rss_content},
};

pub mod books;
pub mod games;
pub mod movies;
pub mod shows;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Masterpiece,
    Loved,
    Liked,
    Okay,
    Disliked,
    Hated,
}

impl Display for Rating {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let rating_str = match self {
            Rating::Masterpiece => "Masterpiece",
            Rating::Loved => "Loved",
            Rating::Liked => "Liked",
            Rating::Okay => "Okay",
            Rating::Disliked => "Disliked",
            Rating::Hated => "Hated",
        };
        write!(f, "{}", rating_str)
    }
}

impl Rating {
    pub fn to_number(&self) -> u8 {
        match self {
            Rating::Masterpiece => 5,
            Rating::Loved => 4,
            Rating::Liked => 3,
            Rating::Okay => 2,
            Rating::Disliked => 1,
            Rating::Hated => 0,
        }
    }
}

pub trait CatalogueMetadata<T> {
    fn set_cover(&mut self, cover: (String, String));

    fn set_metadata(&mut self, metadata: T)
    where
        T: DeserializeOwned;

    fn get_metadata(&self) -> &T;

    fn get_author(&self) -> Option<String> {
        None
    }
}

pub fn catalogue_add_metadata<T, A>(
    entries: &[Entry<T>],
    options: Option<MarkdownOptions>,
) -> Vec<Entry<T>>
where
    T: maudit::content::MarkdownContent
        + maudit::content::InternalMarkdownContent
        + serde::de::DeserializeOwned
        + CatalogueMetadata<A>,
    A: DeserializeOwned,
{
    let options = options.map(Arc::new);
    entries
        .iter()
        .map(|entry| {
            let id = entry.id.clone();
            let file_path = entry.file_path.clone().unwrap();
            let raw_content = entry.raw_content.clone().unwrap_or_default();
            let opts = options.clone();

            let data_loader = {
                let content = raw_content.clone();
                let file_path = file_path.clone();

                Box::new(move |ctx: &mut dyn ContentContext| {
                    let mut entry = parse_markdown_with_frontmatter::<T>(&content);

                    let metadata_path = file_path.with_file_name("_data.json");
                    let metadata_data = std::fs::read_to_string(&metadata_path).unwrap();
                    let metadata: A = serde_json::from_str(&metadata_data).unwrap_or_else(|e| {
                        panic!(
                            "Failed to parse metadata JSON for file: {}, {}",
                            metadata_path.display(),
                            e
                        )
                    });

                    entry.set_metadata(metadata);

                    let cover_path = file_path
                        .with_file_name("cover.png")
                        .canonicalize()
                        .unwrap()
                        .to_string_lossy()
                        .to_string();
                    let cover = ctx.assets().add_image_with_options(
                        cover_path,
                        ImageOptions {
                            width: Some(240),
                            format: Some(ImageFormat::Avif),
                            ..Default::default()
                        },
                    );

                    let placeholder = cover.placeholder();

                    entry.set_cover((
                        cover.url().to_string(),
                        placeholder.thumbhash_base64.clone(),
                    ));

                    entry
                })
            };

            let renderer = {
                let path = file_path.clone();
                let opts = opts.clone();
                Box::new(move |content: &str, route_ctx: &mut PageContext| {
                    render_markdown(content, opts.as_deref(), Some(&path), Some(route_ctx))
                })
            };

            Entry::create_lazy(
                id,
                Some(renderer),
                Some(raw_content),
                data_loader,
                Some(file_path),
            )
        })
        .collect()
}

pub fn deserialize_optional_date<'de, D>(deserializer: D) -> Result<Option<NaiveDate>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: String = Deserialize::deserialize(deserializer)?;
    if s == "N/A" {
        Ok(None)
    } else {
        NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .map(Some)
            .map_err(serde::de::Error::custom)
    }
}

fn catalogue_entry_to_xml(
    id: &str,
    title: String,
    rating: &Rating,
    finished_date: Option<NaiveDate>,
    rendered_content: &str,
    catalogue_type: &str,
) -> Result<XMLElement, crate::rss::AsXMLError> {
    // TODO: When actual pages for catalogue entries exist, we can do this typesafe
    let entry_url = format!("https://erika.florist/catalogue/{}/{}", catalogue_type, id);

    let mut item = XMLElement::new("item");

    let mut item_title = XMLElement::new("title");
    item_title.add_text(title)?;
    item.add_child(item_title)?;

    let mut item_link = XMLElement::new("link");
    item_link.add_text(entry_url.clone())?;
    item.add_child(item_link)?;

    let mut guid = XMLElement::new("guid");
    guid.add_attribute("isPermaLink", "true");
    guid.add_text(entry_url)?;
    item.add_child(guid)?;

    let mut pub_date = XMLElement::new("pubDate");

    if let Some(finished_date) = finished_date {
        let formatted_date = finished_date
            .format("%a, %d %b %Y 00:00:00 +0000")
            .to_string();
        pub_date.add_text(formatted_date)?;
    } else {
        pub_date.add_text("Thu, 01 Jan 1970 00:00:00 +0000".to_string())?;
    }
    item.add_child(pub_date)?;

    let mut item_description = XMLElement::new("description");
    let description_text = format!("{}", rating);
    item_description.add_text(description_text)?;
    item.add_child(item_description)?;

    let content = rewrite_rss_content(rendered_content)?;

    let mut content_encoded = XMLElement::new("content:encoded");
    content_encoded.add_text(format!("<![CDATA[{}]]>", content))?;
    item.add_child(content_encoded)?;

    Ok(item)
}

pub enum CatalogueEntry {
    Game(Entry<CatalogueGame>),
    Movie(Entry<CatalogueMovie>),
    Book(Entry<CatalogueBook>),
    Show(Entry<CatalogueShow>),
}

impl CatalogueEntry {
    pub fn as_xml_element(&self, ctx: &mut PageContext) -> Result<XMLElement, AsXMLError> {
        match self {
            CatalogueEntry::Game(g) => {
                let data = g.data(ctx);
                let rendered_content = g.render(ctx);
                catalogue_entry_to_xml(
                    &g.id,
                    data.title.clone(),
                    &data.rating,
                    data.finished_date,
                    &rendered_content,
                    "games",
                )
            }
            CatalogueEntry::Movie(m) => {
                let data = m.data(ctx);
                let rendered_content = m.render(ctx);
                catalogue_entry_to_xml(
                    &m.id,
                    data.title.clone(),
                    &data.rating,
                    data.finished_date,
                    &rendered_content,
                    "movies",
                )
            }
            CatalogueEntry::Book(b) => {
                let data = b.data(ctx);
                let rendered_content = b.render(ctx);
                catalogue_entry_to_xml(
                    &b.id,
                    data.title.clone(),
                    &data.rating,
                    data.finished_date,
                    &rendered_content,
                    "books",
                )
            }
            CatalogueEntry::Show(s) => {
                let data = s.data(ctx);
                let rendered_content = s.render(ctx);
                catalogue_entry_to_xml(
                    &s.id,
                    data.title.clone(),
                    &data.rating,
                    data.finished_date,
                    &rendered_content,
                    "shows",
                )
            }
        }
    }

    pub fn finished_date(&self, ctx: &mut PageContext) -> Option<NaiveDate> {
        match self {
            CatalogueEntry::Game(g) => g.data(ctx).finished_date,
            CatalogueEntry::Movie(m) => m.data(ctx).finished_date,
            CatalogueEntry::Book(b) => b.data(ctx).finished_date,
            CatalogueEntry::Show(s) => s.data(ctx).finished_date,
        }
    }
}
