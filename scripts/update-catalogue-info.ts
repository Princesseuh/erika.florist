import { bold } from "kleur/colors";
import { Logger } from "./catalogueUtils.ts";
import { getDataForBooks } from "./getInfoCoverBook.ts";
import { getDataForGames } from "./getInfoCoverGame.ts";
import { getDataForMoviesAndShows } from "./getInfoCoverMovieShow.ts";

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
