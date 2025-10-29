use erikaflorist::{content::content_sources, pages};
use maudit::{AssetsOptions, BuildOptions, BuildOutput, coronate, routes};

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
            pages::ProjectPage
        ],
        content_sources(".".to_owned()),
        BuildOptions {
            assets: AssetsOptions {
                tailwind_binary_path: "../../node_modules/.bin/tailwindcss".into(),
                ..Default::default()
            },
            ..Default::default()
        },
    )
}
