use lol_html::{RewriteStrSettings, element, rewrite_str};
use maudit::route::PageContext;
use std::{error::Error, fmt::Display};
use xml_builder::XMLElement;

pub mod blog;
pub mod catalogue;

pub trait IntoXMLElement<T> {
    fn as_xml_element(&self, ctx: &mut PageContext) -> Result<XMLElement, AsXMLError>;
}

#[derive(Debug)]
pub enum AsXMLError {
    Rewrite(lol_html::errors::RewritingError),
    XMLBuilder(xml_builder::XMLError),
}

impl Display for AsXMLError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AsXMLError::Rewrite(err) => write!(f, "HTML Rewriting Error: {}", err),
            AsXMLError::XMLBuilder(err) => write!(f, "XML Builder Error: {}", err),
        }
    }
}

impl From<lol_html::errors::RewritingError> for AsXMLError {
    fn from(err: lol_html::errors::RewritingError) -> Self {
        AsXMLError::Rewrite(err)
    }
}

impl From<xml_builder::XMLError> for AsXMLError {
    fn from(err: xml_builder::XMLError) -> Self {
        AsXMLError::XMLBuilder(err)
    }
}

impl Error for AsXMLError {}

/// Rewrite some stuff inside the HTML content for RSS purposes. RSS readers are quite old school and finnicky and can often struggle with some HTML constructs
pub fn rewrite_rss_content(content: &str) -> Result<String, lol_html::errors::RewritingError> {
    rewrite_str(
        content,
        RewriteStrSettings {
            element_content_handlers: vec![
                element!("a[href]", |el| {
                    if let Some(href) = el.get_attribute("href")
                        && href.starts_with('/')
                    {
                        el.set_attribute("href", &format!("https://erika.florist{}", href))?;
                    }
                    Ok(())
                }),
                element!("img[src]", |el| {
                    if let Some(src) = el.get_attribute("src")
                        && src.starts_with('/')
                    {
                        el.set_attribute("src", &format!("https://erika.florist{}", src))?;
                    }
                    Ok(())
                }),
            ],
            ..RewriteStrSettings::default()
        },
    )
}
