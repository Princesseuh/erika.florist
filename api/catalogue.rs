use core::fmt;
use maud::{html, Markup, PreEscaped, Render};
use paginate::Pages;
use rusqlite::{Connection, OpenFlags, Result, ToSql};
use std::{
    fmt::{Display, Formatter},
    str::FromStr,
};
use strum_macros::EnumString;
use sublime_fuzzy::best_match;
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

#[derive(EnumString, Debug)]
#[strum(serialize_all = "snake_case")]
enum Rating {
    Masterpiece,
    Loved,
    Liked,
    Okay,
    Disliked,
    Hated,
}

impl Render for Rating {
    fn render(&self) -> Markup {
        let rating = match self {
            Rating::Masterpiece => "❤️",
            Rating::Loved => "🥰",
            Rating::Liked => "🙂",
            Rating::Okay => "😐",
            Rating::Disliked => "😕",
            Rating::Hated => "🙁",
        };

        html! {
            span."absolute top-0 right-0 pr-[0.15rem] pl-[0.2rem] bg-black/5 rounded-bl-lg select-none" {
                (rating)
            }
        }
    }
}

#[derive(Debug)]
struct Cover {
    src: String,
    width: u32,
    height: u32,
    placeholder: String,
}

impl Render for Cover {
    fn render(&self) -> Markup {
        html! {
            img."max-w-full h-auto aspect-[3/4.3] object-cover" width=(self.width) height=(self.height) src=(self.src)
            loading="lazy" style={"background-size: cover;background-image: url(" (self.placeholder) ");image-rendering:auto;"}
            onload="this.removeAttribute('style');this.removeAttribute('onload');" decoding="async";
        }
    }
}

#[derive(Debug)]
struct CatalogueEntry {
    title: String,
    author: String,
    cover: Cover,
    rating: Rating,
    search_score: isize,
}

#[derive(Eq, PartialEq, serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "snake_case")]
enum Sort {
    Alphabetical,
    Date,
    Rating,
    #[serde(untagged)]
    Unknown(String),
}

#[derive(Debug, serde::Deserialize)]
struct QueryParams {
    search: Option<String>,
    sort: Option<Sort>,
    r#type: Option<String>,
    rating: Option<String>,
    before: Option<String>,
    after: Option<String>,
    page: Option<usize>,
}

enum NextStatement {
    And,
    Where,
}

impl Display for NextStatement {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            NextStatement::And => write!(f, " AND "),
            NextStatement::Where => write!(f, " WHERE "),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}

pub async fn handler(_req: Request) -> Result<Response<Body>, Error> {
    let conn = Connection::open_with_flags(
        "./api/cataloguedb.db",
        OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_READ_WRITE,
    )?;

    let query_params = match _req.uri().query() {
        Some(query) => serde_qs::from_str::<QueryParams>(query)?,
        None => QueryParams {
            search: None,
            sort: None,
            r#type: None,
            rating: None,
            before: None,
            after: None,
            page: None,
        },
    };

    let mut parameters: Vec<(&str, &dyn ToSql)> = Vec::new();
    let mut next_statement = NextStatement::Where;

    let mut statement = String::from(
        "SELECT a.*, c.src, c.placeholder FROM Catalogue a
            INNER JOIN Cover c
            ON c.id = a.cover",
    );

    match query_params.rating {
        Some(_) => {
            parameters.push((":rating", &query_params.rating));
            statement.push_str(format!("{} rating = :rating", next_statement).as_str());
            next_statement = NextStatement::And;
        }
        None => (),
    }

    match query_params.r#type {
        Some(_) => {
            parameters.push((":type", &query_params.r#type));
            statement.push_str(format!("{} type = :type", next_statement).as_str());
            next_statement = NextStatement::And;
        }
        None => (),
    }

    match query_params.before {
        Some(_) => {
            parameters.push((":before", &query_params.before));
            statement.push_str(format!("{} finishedDate < :before", next_statement).as_str());
            next_statement = NextStatement::And;
        }
        None => (),
    }

    match query_params.after {
        Some(_) => {
            parameters.push((":after", &query_params.after));
            statement.push_str(format!("{} finishedDate > :after", next_statement).as_str());
        }
        None => (),
    }

    match query_params.sort {
        Some(Sort::Alphabetical) => {
            statement.push_str(" ORDER BY a.title ASC, a.finishedDate DESC;");
        }
        Some(Sort::Rating) => {
            statement.push_str(
                " ORDER BY CASE
                    WHEN a.rating = 'masterpiece' THEN 1
                    WHEN a.rating = 'loved' THEN 2
                    WHEN a.rating = 'liked' THEN 3
                    WHEN a.rating = 'okay' THEN 4
                    WHEN a.rating = 'disliked' THEN 5
                    WHEN a.rating = 'hated' THEN 6
                    ELSE 7
                    END ASC, a.finishedDate DESC;",
            );
        }
        _ => {
            statement.push_str(" ORDER BY a.finishedDate DESC;");
        }
    }

    let mut stmt = conn.prepare(&statement)?;
    let mut catalogue_entries: Vec<CatalogueEntry> = stmt
        .query_map(parameters.as_slice(), |row| {
            Ok(CatalogueEntry {
                title: row.get(2)?,
                author: row.get(3)?,
                cover: Cover {
                    src: row.get(9)?,
                    width: 240,
                    height: 360,
                    placeholder: row.get(10)?,
                },
                rating: Rating::from_str(row.get_ref(5).unwrap().as_str()?).unwrap(),
                search_score: match &query_params.search {
                    Some(search) => {
                        let best_match =
                            match best_match(&search, &row.get_ref(2).unwrap().as_str()?) {
                                Some(best_match) => best_match.score(),
                                None => 0,
                            };

                        best_match
                    }
                    None => 0,
                },
            })
        })?
        .map(|cat| cat.unwrap())
        .filter(|cat| match &query_params.search {
            Some(_) => cat.search_score > 0,
            None => true,
        })
        .collect();

    match query_params.search {
        Some(_) => {
            catalogue_entries.sort_by(|a, b| b.search_score.cmp(&a.search_score));
        }
        None => (),
    }

    let total_items = catalogue_entries.len();
    let items_per_page = 30usize;
    let pages = Pages::new(total_items, items_per_page);
    let page = pages.with_offset(query_params.page.unwrap_or(1) - 1);

    catalogue_entries = catalogue_entries
        .into_iter()
        .skip(page.start)
        .take(page.length)
        .collect();

    // Maud is sooo fun to use!!
    let markup = html! {
      "{"
      (PreEscaped("  \"totalItems\": ")) (total_items) ","
      (PreEscaped("  \"itemsPerPage\": ")) (items_per_page) ","
      (PreEscaped("  \"currentPage\": ")) (page.offset) ","
      (PreEscaped(" \"currentOffset\": ")) (page.start) ","
      (PreEscaped("  \"totalPages\": ")) (pages.page_count())
      "}"
      "!METAEND"
      @for entry in catalogue_entries {
        div."w-[calc(50%-1rem)] sm:w-[calc(20%-1rem)]" {
          div."relative" {
            (entry.cover)
            (entry.rating)
          }
          h4."m-0 leading-tight" {
            (entry.title)
          }
          p."text-sm" {
            (entry.author)
          }
        }
      }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "max-age=3600, s-maxage=604800")
        .body(markup.into_string().into())?)
}
