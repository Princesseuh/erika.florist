use maudit::content::{Entry, markdown_entry};
use serde::{Deserialize, Serialize};

use crate::content::strip_frontmatter;

/// Only projects with a body get a detail page; the rest link straight out, so nothing points at a 404.
pub fn has_project_page(entry: &Entry<Project>) -> bool {
    entry
        .raw_content
        .as_deref()
        .is_some_and(|raw| !strip_frontmatter(raw).trim().is_empty())
}

#[derive(Debug, Serialize)]
#[markdown_entry]
pub struct Project {
    pub title: String,
    pub tagline: Option<String>,
    pub featured: Option<bool>,
    pub date: Option<chrono::NaiveDate>,
    pub r#type: ProjectType,
    pub external_url: Option<String>,
    pub repository_url: Option<String>,
    pub role: Option<ProjectRole>,
    pub org: Option<ProjectOrg>,
    pub archived: Option<bool>,
}

#[derive(Debug, Deserialize, PartialEq, PartialOrd, Eq, Ord, Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ProjectType {
    Software,
    Site,
    Game,
}

impl ProjectType {
    pub const ALL: [ProjectType; 3] = [Self::Software, Self::Site, Self::Game];

    pub fn slug(&self) -> &'static str {
        match self {
            Self::Software => "software",
            Self::Site => "site",
            Self::Game => "game",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Software => "Software",
            Self::Site => "Website",
            Self::Game => "Game",
        }
    }

    pub fn plural(&self) -> &'static str {
        match self {
            Self::Software => "Software",
            Self::Site => "Websites",
            Self::Game => "Games",
        }
    }
}

#[derive(Debug, Deserialize, PartialEq, PartialOrd, Eq, Ord, Serialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectRole {
    Creator,
    CoreMaintainer,
    Contributor,
}

impl ProjectRole {
    pub const ALL: [ProjectRole; 3] = [Self::Creator, Self::CoreMaintainer, Self::Contributor];

    pub fn slug(&self) -> &'static str {
        match self {
            Self::Creator => "creator",
            Self::CoreMaintainer => "core-maintainer",
            Self::Contributor => "contributor",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Creator => "Creator",
            Self::CoreMaintainer => "Core maintainer",
            Self::Contributor => "Contributor",
        }
    }
}

#[derive(Debug, Deserialize, PartialEq, PartialOrd, Eq, Ord, Serialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectOrg {
    Bruits,
    GameDevAlliance,
}

impl ProjectOrg {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Bruits => "Bruits",
            Self::GameDevAlliance => "Game Dev Alliance",
        }
    }

    pub fn url(&self) -> &'static str {
        match self {
            Self::Bruits => "https://bruits.org",
            Self::GameDevAlliance => "https://gamedevalliance.fr",
        }
    }
}
