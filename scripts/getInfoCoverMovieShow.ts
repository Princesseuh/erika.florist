import "dotenv/config";
import matter from "gray-matter";
import { bold, gray } from "kleur/colors";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Logger, getContentDirs } from "./catalogueUtils";

export interface MovieData {
	id: string;
	title: string;
	tagline: string;
	overview: string;
	release_date: string;
	production_companies?: { id: string; name: string; logo_path: string; origin_country: string }[];
	genres: { id: number; name: string }[];
	runtime: number;
	poster_path: string;
}

export async function getDataForMoviesAndShows(type: "movies" | "shows") {
	const apiKey = process.env.TMDB_KEY;
	const moviesShowsDirs = getContentDirs(type);

	for (const movieShowDir of moviesShowsDirs) {
		const dirBasename = path.basename(decodeURI(movieShowDir.pathname));
		const dataFilePath = new URL("./_data.json", movieShowDir);

		Logger.info(`Getting data for ${type}/${bold(dirBasename)}...`);
		if (fs.existsSync(dataFilePath)) {
			Logger.info(gray("Data already exists, skipping..."));
			continue;
		}

		const markdownContent = fs
			.readFileSync(new URL(`${path.basename(movieShowDir.pathname)}.mdoc`, movieShowDir))
			.toString();
		const id = matter(markdownContent).data.tmdb;
		const response = (await fetch(
			`https://api.themoviedb.org/3/${type === "movies" ? "movie" : "tv"}/${id}?api_key=${apiKey}`,
		).then((response) => response.json())) as MovieData;

		const resultData = {
			title: response.title,
			tagline: response.tagline,
			id: response.id,
			overview: response.overview,
			releaseDate: response.release_date,
			runtime: response.runtime,
			companies: response.production_companies?.map((company) => company.name),
			genres: response.genres?.map((genre) => genre.name),
		};

		fs.writeFileSync(dataFilePath, JSON.stringify(resultData, null, 2));
		Logger.success(`Data saved for ${bold(dirBasename)}!`);

		const { poster_path } = response;
		const posterURL = `https://image.tmdb.org/t/p/w780${poster_path}`;
		const coverData = await fetch(posterURL).then((response) => response.arrayBuffer());
		const coverPath = new URL("./cover.png", movieShowDir);

		if (!posterURL.endsWith("png")) {
			await sharp(coverData).toFile(decodeURI(coverPath.pathname));
		} else {
			fs.writeFileSync(coverPath, Buffer.from(coverData));
		}

		Logger.success(`Cover saved for ${bold(dirBasename)}!`);
	}

	return moviesShowsDirs.length;
}
