use chrono::NaiveDate;
use maudit::content::markdown_entry;
use serde::Deserialize;

use crate::content::{catalogue::deserialize_optional_date, catalogue::Rating, CatalogueMetadata};

#[derive(Debug)]
#[markdown_entry]
pub struct CatalogueShow {
    pub title: String,
    pub rating: Rating,
    #[serde(
        rename = "finishedDate",
        deserialize_with = "deserialize_optional_date"
    )]
    pub finished_date: Option<NaiveDate>,
    pub tmdb: String,
    #[serde(skip)]
    __metadata: Option<ShowData>,
    #[serde(skip)]
    pub cover: (String, String), // (URL, Placeholder)
}

#[derive(Debug, Deserialize)]
pub struct ShowData {
    pub tagline: Option<String>,
    pub id: u32,
    pub overview: Option<String>,
    pub companies: Vec<String>,
    pub genres: Vec<String>,
}

impl CatalogueMetadata<ShowData> for CatalogueShow {
    fn set_metadata(&mut self, metadata: ShowData) {
        self.__metadata = Some(metadata);
    }

    fn set_cover(&mut self, cover: (String, String)) {
        self.cover = cover;
    }

    fn get_metadata(&self) -> &ShowData {
        self.__metadata.as_ref().unwrap()
    }

    fn get_author(&self) -> Option<String> {
        self.get_metadata().companies.first().cloned()
    }
}
