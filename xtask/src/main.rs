mod tasks;
mod utils;

use std::env;

fn print_help() {
    println!(
        r#"Usage: cargo xtask <task> [options]

Tasks:
  update-catalogue          Fetch metadata and covers for all catalogue entries
                            (games, books, movies, shows) in parallel.
                            Requires IGDB_CLIENT, IGDB_KEY and TMDB_KEY env vars.

  export-letterboxd         Generate a Letterboxd-compatible CSV from movie entries.
                            Writes to ./letterboxd-export.csv

  get-info-books            Fetch metadata and covers for book entries only.

  get-info-games            Fetch metadata and covers for game entries only.
                            Requires IGDB_CLIENT and IGDB_KEY env vars.

  get-info-movies           Fetch metadata and covers for movie entries only.
                            Requires TMDB_KEY env var.

  get-info-shows            Fetch metadata and covers for show entries only.
                            Requires TMDB_KEY env var.

  subset-fonts [--title] [--content]
                            Subset variable fonts using fonttools/pyftsubset.
                            Requires Python, fonttools and pyftsubset to be installed.

  optimize-covers [type] [--dry-run] [--level N]
                            Losslessly shrink cover.png files with oxipng, in place.
                            Optional type limits scope (books, games, movies, shows,
                            projects); default is all. --dry-run only reports savings.
                            --level 0-6 sets the oxipng preset (default 4).

Options:
  --silent                  Suppress INFO-level log output.
  --help, -h                Print this help message.
"#
    );
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    let task = args.get(1).map(|s| s.as_str()).unwrap_or("--help");

    match task {
        "--help" | "-h" | "help" => {
            print_help();
            Ok(())
        }
        "update-catalogue" => tasks::update_catalogue::run_update_catalogue(),
        "export-letterboxd" => {
            let _ = dotenvy::dotenv();
            tasks::export_letterboxd::run_export_letterboxd()
        }
        "get-info-books" => {
            let _ = dotenvy::dotenv();
            tasks::get_info_cover_book::run_get_data_books().map(|_| ())
        }
        "get-info-games" => {
            let _ = dotenvy::dotenv();
            tasks::get_info_cover_game::run_get_data_games().map(|_| ())
        }
        "get-info-movies" => {
            let _ = dotenvy::dotenv();
            tasks::get_info_cover_movie_show::run_get_data_movies_shows("movies").map(|_| ())
        }
        "get-info-shows" => {
            let _ = dotenvy::dotenv();
            tasks::get_info_cover_movie_show::run_get_data_movies_shows("shows").map(|_| ())
        }
        "subset-fonts" => {
            let title = args.iter().any(|a| a == "--title");
            let content = args.iter().any(|a| a == "--content");
            tasks::subset_fonts::run_subset_fonts(title, content)
        }
        "optimize-covers" => {
            let dry_run = args.iter().any(|a| a == "--dry-run");
            let content_type = args
                .get(2)
                .map(|s| s.as_str())
                .filter(|s| !s.starts_with('-'));
            tasks::optimize_covers::run_optimize_covers(content_type, dry_run)
        }
        unknown => {
            eprintln!("Unknown task: {unknown}");
            print_help();
            std::process::exit(1);
        }
    }
}
