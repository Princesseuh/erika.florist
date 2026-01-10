use erikaflorist::{content::content_sources, pages};
use maudit::{AssetsOptions, BuildOptions, BuildOutput, SitemapOptions, coronate, routes};

fn main() -> Result<BuildOutput, Box<dyn std::error::Error>> {
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
            pages::BlogRSS,
            pages::CatalogueRSS
        ],
        content_sources(".".to_owned()),
        BuildOptions {
            base_url: Some("https://erika.florist".into()),
            assets: AssetsOptions {
                tailwind_binary_path: "../../node_modules/.bin/tailwindcss".into(),
                image_cache_dir: "../../target/maudit_cache/images".into(),
                ..Default::default()
            },
            sitemap: SitemapOptions {
                enabled: true,
                ..Default::default()
            },
            ..Default::default()
        },
    )
}
