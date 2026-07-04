use chrono::{DateTime, Datelike, NaiveDate};
use maudit::content::markdown_entry;
use serde::Deserialize;

use crate::content::{
    CatalogueMetadata,
    catalogue::{Rating, Status, deserialize_optional_date},
};

#[derive(Debug)]
#[markdown_entry]
pub struct CatalogueBook {
    pub title: String,
    #[serde(default)]
    pub rating: Option<Rating>,
    #[serde(default)]
    pub status: Status,
    #[serde(
        rename = "finishedDate",
        default,
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
pub struct BookData {
    pub title: String,
    pub authors: Vec<String>,
    pub publishers: Vec<String>,
    pub pages: Option<u32>,
    // OpenLibrary omits the publish date for some editions.
    #[serde(rename = "publishDate", default)]
    pub publish_date: Option<u64>,
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

    fn get_status(&self) -> Status {
        self.status
    }

    fn get_rating(&self) -> Option<&Rating> {
        self.rating.as_ref()
    }

    fn get_title(&self) -> &str {
        &self.title
    }

    fn get_cover(&self) -> &(String, String) {
        &self.cover
    }

    fn get_finished_date(&self) -> Option<NaiveDate> {
        self.finished_date
    }

    fn get_author(&self) -> Option<String> {
        self.get_metadata()
            .authors
            .first()
            .cloned()
            .or_else(|| self.get_metadata().publishers.first().cloned())
    }

    fn get_release_year(&self) -> Option<i32> {
        self.get_metadata()
            .publish_date
            .and_then(|ts| DateTime::from_timestamp(ts as i64, 0))
            .map(|dt| dt.year())
    }
}
