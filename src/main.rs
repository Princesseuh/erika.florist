#![allow(dead_code)]
use maud::html;
use maudit::{
    AssetsOptions, BuildOptions, BuildOutput,
    assets::{Asset, ImageFormat, ImageOptions},
    content::{
        MarkdownOptions, glob_markdown, glob_markdown_with_options, shortcodes::MarkdownShortcodes,
    },
    content_sources, coronate, routes,
};

use crate::{
    components::dinkus,
    content::{
        BlogPost, CatalogueBook, CatalogueGame, CatalogueMovie, CatalogueShow, Project, WikiEntry,
        catalogue_add_metadata, wiki_add_modified_info,
    },
};

mod state;

mod pages {
    mod blog;
    mod catalogue;
    mod index;
    mod projects;
    mod rss;
    mod wiki;
    pub use blog::{BlogIndex, BlogPostPage, BlogTagIndex, BlogYearIndex};
    pub use catalogue::{Catalogue, CatalogueContent};
    pub use index::Index;
    pub use projects::{ProjectIndex, ProjectPage};
    pub use rss::BlogRSS;
    pub use wiki::{WikiEntryPage, WikiIndex};
}

mod layouts {
    mod article;
    mod base;
    pub use article::article_layout;
    pub use base::base_layout;
}

mod components {
    mod article;
    pub use article::article_preview;
    mod dinkus;
    mod header;
    mod icon;
    mod logo;
    mod socials;
    mod spritesheet;
    mod tags;
    mod toc;
    pub use dinkus::dinkus;
    pub use header::header;
    pub use socials::socials;
    pub use spritesheet::spritesheet;
    pub use tags::tags;
    pub use toc::table_of_content;
}

mod content {
    mod blog;
    mod catalogue;
    mod project;
    mod wiki;
    pub use blog::BlogPost;
    pub use catalogue::{
        CatalogueMetadata, books::CatalogueBook, catalogue_add_metadata, games::CatalogueGame,
        movies::CatalogueMovie, shows::CatalogueShow,
    };
    pub use project::{Project, ProjectType};
    pub use wiki::{WikiEntry, wiki_add_modified_info};
}

fn main() -> Result<BuildOutput, Box<dyn std::error::Error>> {
    let create_markdown_options = || {
        let mut shortcodes = MarkdownShortcodes::default();

        shortcodes.register("dinkus", |_, _| dinkus(None).into_string());

        shortcodes.register("sidenote", |attrs, _| {
            let body: String = attrs.get_required("body");

            html!(
                span.
                    "left-0 mb-6 mt-4 inline-block w-full italic md:absolute md:mb-0 md:mt-0 md:h-0 md:not-italic" {
                    span.
                        "relative inline-block md:left-[calc(100%+1rem)] md:w-[30%] md:text-sm xl:left-[calc(100%+2rem)]" {
                        (body)
                    }
                }
            ).into_string()
        });

        shortcodes.register("blockquote", |attrs, _| {
            let title: Option<String> = attrs.get("title");
            let block: Option<bool> = attrs.get("block");
            let body: String = attrs.get_required("body");

            html!(
                @if block.unwrap_or(false) {
                    div class="" {
                        span class="" { (title.unwrap_or_default()) }
                        (body)
                    }
                } @else {
                    blockquote {
                        (body)
                    }
                }
            )
            .into_string()
        });

        shortcodes.register("image", |attrs, ctx| {
            let src: String = attrs.get_required("src");
            let alt: Option<String> = attrs.get("alt");
            let class: Option<String> = attrs.get("class");

            let body: Option<String> = attrs.get("body");
            let markdown_path: String = attrs.get_required("markdown_path");

            let ctx = ctx.unwrap();

            // Extract the directory path from the markdown file path
            let markdown_dir = std::path::Path::new(&markdown_path)
                .parent()
                .unwrap_or(std::path::Path::new(""))
                .to_string_lossy();

            // Resolve the image path relative to the markdown directory
            let image_path = if let Some(relative_src) = src.strip_prefix("./") {
                format!("{}/{}", markdown_dir, relative_src)
            } else if let Some(absolute_src) = src.strip_prefix("/") {
                absolute_src.to_string()
            } else {
                format!("{}/{}", markdown_dir, src)
            };

            let image = ctx.assets.add_image_with_options(image_path, ImageOptions {
                format: Some(ImageFormat::WebP),
                ..Default::default()
            });

            let body = body
                .filter(|b| !b.trim().is_empty())
                .map(|b| b.trim().to_string());

            let (width, height) = image.dimensions();

            let placeholder = image.placeholder();

            html!({
                figure {
                    img class=(class.unwrap_or_default()) src=(image.url()) alt=(alt.unwrap_or_default()) loading="lazy" decoding="async" width=(width) height=(height) style=(format!("background-image: url('{}');background-size: cover;image-rendering:auto;", placeholder.data_uri())) onload="this.style.backgroundSize = null; this.style.backgroundImage = null; this.style.imageRendering = null; this.removeAttribute('onload');" {}
                    @if let Some(caption) = body {
                        figcaption {
                            (caption)
                        }
                    }
                }
            }).into_string()
        });

        MarkdownOptions {
            shortcodes,
            ..Default::default()
        }
    };

    coronate(
        routes![
            pages::Index,
            pages::BlogIndex,
            pages::BlogPostPage,
            pages::BlogTagIndex,
            pages::BlogYearIndex,
            pages::CatalogueContent,
            pages::Catalogue,
            pages::WikiIndex,
            pages::WikiEntryPage,
            pages::ProjectIndex,
            pages::ProjectPage,
            pages::BlogRSS
        ],
        content_sources![
            "blog" => glob_markdown_with_options::<BlogPost>("content/blog/**/*.md", create_markdown_options()),
            "wiki" => wiki_add_modified_info(&glob_markdown::<WikiEntry>("content/wiki/**/*.md"), create_markdown_options()),
            "projects" => glob_markdown::<Project>("content/projects/**/*.md"),

            // Catalogue
            "books" => catalogue_add_metadata(&glob_markdown::<CatalogueBook>("content/books/**/*.md"), None),
            "movies" => catalogue_add_metadata(&glob_markdown::<CatalogueMovie>("content/movies/**/*.md"), None),
            "shows" => catalogue_add_metadata(&glob_markdown::<CatalogueShow>("content/shows/**/*.md"), None),
            "games" => catalogue_add_metadata(&glob_markdown::<CatalogueGame>("content/games/**/*.md"), None)
        ],
        BuildOptions {
            assets: AssetsOptions {
                tailwind_binary_path: "./node_modules/.bin/tailwindcss".into(),
                ..Default::default()
            },
            ..Default::default()
        },
    )
}
