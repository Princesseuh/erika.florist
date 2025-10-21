use maudit::content::markdown_entry;
use serde::Deserialize;

#[derive(Debug)]
#[markdown_entry]
pub struct Project {
    pub title: String,
    pub tagline: Option<String>,
    pub featured: Option<bool>,
    pub date: Option<chrono::NaiveDate>,
    pub r#type: ProjectType,
    pub external_url: Option<String>,
}

#[derive(Debug, Deserialize, PartialEq, PartialOrd, Eq, Ord)]
#[serde(rename_all = "lowercase")]
pub enum ProjectType {
    Software,
    Game,
    Site,
}
