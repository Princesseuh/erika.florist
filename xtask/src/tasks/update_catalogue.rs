use crate::utils::log_success;
use rayon::prelude::*;

pub fn run_update_catalogue() -> anyhow::Result<()> {
    // Load .env before spawning threads so vars are available everywhere
    let _ = dotenvy::dotenv();

    let results: Vec<anyhow::Result<(usize, &str)>> = [
        ("games", "games"),
        ("books", "books"),
        ("movies", "movies"),
        ("shows", "shows"),
    ]
    .par_iter()
    .map(|(content_type, label)| {
        let count = match *content_type {
            "games" => crate::tasks::get_info_cover_game::run_get_data_games()?,
            "books" => crate::tasks::get_info_cover_book::run_get_data_books()?,
            "movies" => {
                crate::tasks::get_info_cover_movie_show::run_get_data_movies_shows("movies")?
            }
            "shows" => crate::tasks::get_info_cover_movie_show::run_get_data_movies_shows("shows")?,
            _ => unreachable!(),
        };
        Ok((count, *label))
    })
    .collect();

    let mut game_count = 0;
    let mut book_count = 0;
    let mut movies_count = 0;
    let mut shows_count = 0;

    for result in results {
        match result {
            Ok((count, "games")) => game_count = count,
            Ok((count, "books")) => book_count = count,
            Ok((count, "movies")) => movies_count = count,
            Ok((count, "shows")) => shows_count = count,
            Ok(_) => {}
            Err(e) => return Err(e),
        }
    }

    let total = game_count + book_count + movies_count + shows_count;
    log_success(&format!(
        "Got data for {game_count} games, {book_count} books, {movies_count} movies and {shows_count} shows! Total: {total}."
    ));

    Ok(())
}
