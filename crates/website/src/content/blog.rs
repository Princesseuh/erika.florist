use chrono::NaiveDate;
use maudit::content::markdown_entry;

#[derive(Debug)]
#[markdown_entry]
pub struct BlogPost {
    pub title: String,
    pub tagline: Option<String>,
    pub max_depth_toc: Option<u32>,
    pub featured: Option<bool>,
    pub date: NaiveDate,
    pub tags: Vec<String>,
    pub draft: Option<bool>,
}
