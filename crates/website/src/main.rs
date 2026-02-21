use erikaflorist::{content::content_sources, pages};
use graphgarden_core::{
    build::build,
    config::{Config, OutputConfig, ParseConfig, SiteConfig},
};
use maudit::{AssetsOptions, BuildOptions, BuildOutput, SitemapOptions, coronate, routes};

fn main() -> Result<BuildOutput, Box<dyn std::error::Error>> {
    let output = coronate(
        routes![
            pages::Index,
            pages::BlogIndex,
            pages::BlogPostPage,
            pages::BlogTagIndex,
            pages::BlogYearIndex,
            pages::CatalogueContent,
            pages::Catalogue,
            pages::ChangelogPage,
            pages::LoginPage,
            pages::WikiIndex,
            pages::WikiEntryPage,
            pages::ProjectIndex,
            pages::ProjectPage,
            pages::BlogRSS,
            pages::CatalogueRSS,
            pages::FriendsPage,
            pages::AboutPage
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
    )?;

    // After the Maudit build, generate the GraphGarden protocol file.
    let gg_config = Config {
        site: SiteConfig {
            base_url: "https://erika.florist/".into(),
            title: "erika.florist".into(),
            description: Some("Erika's personal website".into()),
            language: Some("en".into()),
        },
        friends: vec![
            "https://goulven-clech.dev".into(),
            "https://aureliendossantos.com".into(),
        ],
        output: OutputConfig {
            dir: "./dist".into(),
        },
        parse: ParseConfig {
            exclude: Some(vec![
                "articles/tags/**".into(),
                "articles/years/**".into(),
                "articles/_*/**".into(),
                "login/index.html".into(),
            ]),
            exclude_selectors: Some(vec![
                "header".into(),
                "footer".into(),
                "nav".into(),
                "[data-graphgarden-ignore]".into(),
            ]),
            ..Default::default()
        },
    };

    let public_file = build(&gg_config)?;
    let json = public_file.to_json()?;

    let well_known_dir = std::path::Path::new("./dist/.well-known");
    std::fs::create_dir_all(well_known_dir)?;
    std::fs::write(well_known_dir.join("graphgarden.json"), json)?;

    Ok(output)
}
