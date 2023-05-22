import { bold } from "kleur/colors";
import { Logger } from "./catalogueUtils";
import { getDataForBooks } from "./getInfoCoverBook";
import { getDataForGames } from "./getInfoCoverGame";
import { getDataForMoviesAndShows } from "./getInfoCoverMovieShow";

const [gameCount, bookCount, moviesCount, showsCount] = await Promise.all([
  getDataForGames(),
  getDataForBooks(),
  getDataForMoviesAndShows("movies"),
  getDataForMoviesAndShows("shows"),
]);
const totalCount = gameCount + bookCount + moviesCount + showsCount;

Logger.success(
  `Got data for ${bold(gameCount)} games, ${bold(bookCount)} books, ${bold(
    moviesCount,
  )} movies and ${bold(showsCount)} shows! Total: ${bold(totalCount)}.`,
);
