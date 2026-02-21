use chrono::{DateTime, Datelike, NaiveDate};
use maudit::content::markdown_entry;
use serde::Deserialize;

use crate::content::{
    catalogue::{deserialize_optional_date, Rating},
    CatalogueMetadata,
};

#[derive(Debug)]
#[markdown_entry]
pub struct CatalogueGame {
    pub title: String,
    pub rating: Rating,
    #[serde(
        rename = "finishedDate",
        deserialize_with = "deserialize_optional_date"
    )]
    pub finished_date: Option<NaiveDate>,
    pub igdb: String,
    #[serde(skip)]
    __metadata: Option<GameData>,
    #[serde(skip)]
    pub cover: (String, String), // (URL, Placeholder)
}

#[derive(Debug, Deserialize)]
pub struct GameData {
    pub first_release_date: Option<u64>, // Unix timestamp
    pub genres: Vec<GameGenre>,
    pub platforms: Vec<GamePlatform>,
    pub companies: Vec<GameCompany>,
}

#[derive(Debug, Deserialize)]
pub struct GameGenre {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct GamePlatform {
    pub id: u32,
    pub abbreviation: String,
}

#[derive(Debug, Deserialize)]
pub struct GameCompany {
    pub id: u32,
    pub name: String,
    pub role: String,
}

impl CatalogueMetadata<GameData> for CatalogueGame {
    fn set_metadata(&mut self, metadata: GameData) {
        self.__metadata = Some(metadata);
    }

    fn set_cover(&mut self, cover: (String, String)) {
        self.cover = cover;
    }

    fn get_metadata(&self) -> &GameData {
        self.__metadata.as_ref().unwrap()
    }

    fn get_author(&self) -> Option<String> {
        self.get_metadata()
            .companies
            .iter()
            .find(|company| company.role.to_lowercase() == "developer")
            .map(|company| company.name.clone())
    }

    fn get_release_year(&self) -> Option<i32> {
        self.get_metadata()
            .first_release_date
            .and_then(|ts| DateTime::from_timestamp(ts as i64, 0))
            .map(|dt| dt.year())
    }
}
