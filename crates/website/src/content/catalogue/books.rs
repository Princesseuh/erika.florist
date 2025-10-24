use chrono::NaiveDate;
use maudit::content::markdown_entry;
use serde::Deserialize;

use crate::content::{catalogue::deserialize_optional_date, catalogue::Rating, CatalogueMetadata};

#[derive(Debug)]
#[markdown_entry]
pub struct CatalogueBook {
    pub title: String,
    pub rating: Rating, // Define Rating enum or struct elsewhere
    pub platform: BookPlatform,
    #[serde(
        rename = "finishedDate",
        deserialize_with = "deserialize_optional_date"
    )]
    pub finished_date: Option<NaiveDate>,
    pub isbn: String,
    #[serde(skip)]
    __metadata: Option<BookData>,
    #[serde(skip)]
    pub cover: (String, String), // (URL, Placeholder)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BookPlatform {
    Ebook,
    Physical,
    Audiobook,
}

#[derive(Debug, Deserialize)]
pub struct BookData {
    pub title: String,
    pub authors: Vec<String>,
    pub publishers: Vec<String>,
    pub pages: Option<u32>,
    #[serde(rename = "publishDate")]
    pub publish_date: u64,
}

impl CatalogueMetadata<BookData> for CatalogueBook {
    fn set_metadata(&mut self, metadata: BookData) {
        self.__metadata = Some(metadata);
    }

    fn set_cover(&mut self, cover: (String, String)) {
        self.cover = cover;
    }

    fn get_metadata(&self) -> &BookData {
        self.__metadata.as_ref().unwrap()
    }

    fn get_author(&self) -> Option<String> {
        self.get_metadata()
            .authors
            .first()
            .cloned()
            .or_else(|| self.get_metadata().publishers.first().cloned())
    }
}
