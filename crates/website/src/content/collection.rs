use std::str::FromStr;

use maudit::content::markdown_entry;
use serde::{Deserialize, Deserializer, de};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaType {
    Game,
    Movie,
    Show,
    Book,
}

impl MediaType {
    /// Content source key, which is also the on-disk content directory.
    pub fn source(self) -> &'static str {
        match self {
            MediaType::Game => "games",
            MediaType::Movie => "movies",
            MediaType::Show => "shows",
            MediaType::Book => "books",
        }
    }

    /// Suffix used by catalogue deep-links (`?entry=<slug>-<suffix>`).
    pub fn slug_suffix(self) -> &'static str {
        match self {
            MediaType::Game => "game",
            MediaType::Movie => "movie",
            MediaType::Show => "show",
            MediaType::Book => "book",
        }
    }
}

impl FromStr for MediaType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "game" => Ok(MediaType::Game),
            "movie" => Ok(MediaType::Movie),
            "show" | "tv" => Ok(MediaType::Show),
            "book" => Ok(MediaType::Book),
            other => Err(format!("unknown media type: {other}")),
        }
    }
}

/// A reference to a catalogue entry, authored in frontmatter as `type/slug`
/// (e.g. `game/bayonetta`).
#[derive(Debug, Clone)]
pub struct CollectionMember {
    pub media_type: MediaType,
    pub slug: String,
}

impl<'de> Deserialize<'de> for CollectionMember {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        let (kind, slug) = raw
            .split_once('/')
            .ok_or_else(|| de::Error::custom(format!("member '{raw}' must be 'type/slug'")))?;
        let media_type = MediaType::from_str(kind).map_err(de::Error::custom)?;
        Ok(CollectionMember {
            media_type,
            slug: slug.to_string(),
        })
    }
}

#[derive(Debug)]
#[markdown_entry]
pub struct Collection {
    pub title: String,
    #[serde(default)]
    pub members: Vec<CollectionMember>,
}
