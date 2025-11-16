use std::sync::Arc;

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
