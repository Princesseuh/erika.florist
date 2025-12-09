mod blog;
mod catalogue;
mod project;
mod wiki;
pub use blog::BlogPost;
pub use catalogue::{
    CatalogueEntry, CatalogueMetadata, books::CatalogueBook, catalogue_add_metadata,
    games::CatalogueGame, movies::CatalogueMovie, shows::CatalogueShow,
};
use maud::{PreEscaped, html};
pub use maudit::{
    assets::{Asset, ImageFormat, ImageOptions},
    content::{ContentSources, markdown::*, shortcodes::MarkdownShortcodes},
    content_sources,
};
pub use project::{Project, ProjectType};
pub use wiki::{WikiEntry, wiki_add_modified_info};

use crate::components::dinkus;

pub fn content_sources(root: String) -> ContentSources {
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
          }).unwrap();

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
                          (PreEscaped(caption))
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

    let blog_path = format!("{}/content/blog/**/*.md", root);
    let wiki_path = format!("{}/content/wiki/**/*.md", root);
    let projects_path = format!("{}/content/projects/**/*.md", root);
    let books_path = format!("{}/content/books/**/*.md", root);
    let movies_path = format!("{}/content/movies/**/*.md", root);
    let shows_path = format!("{}/content/shows/**/*.md", root);
    let games_path = format!("{}/content/games/**/*.md", root);

    content_sources![
        "blog" => glob_markdown_with_options::<BlogPost>(&blog_path, create_markdown_options()),
        "wiki" => wiki_add_modified_info(&glob_markdown::<WikiEntry>(&wiki_path), create_markdown_options()),
        "projects" => glob_markdown::<Project>(&projects_path),

        // Catalogue
        "books" => catalogue_add_metadata(&glob_markdown::<CatalogueBook>(&books_path), None),
        "movies" => catalogue_add_metadata(&glob_markdown::<CatalogueMovie>(&movies_path), None),
        "shows" => catalogue_add_metadata(&glob_markdown::<CatalogueShow>(&shows_path), None),
        "games" => catalogue_add_metadata(&glob_markdown::<CatalogueGame>(&games_path), None)
    ]
}
