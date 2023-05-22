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
  image: string;
  year: string;
  plot: string;
  releaseDate: string;
  companyList: { id: string; name: string }[];
  genreList: { key: string; value: string }[];
  runtimeStr: string;
}

export async function getDataForMoviesAndShows(type: "movies" | "shows") {
  const apiKey = process.env.IMDB_KEY;
  const moviesShowsDirs = getContentDirs(type);

  for (const movieShowDir of moviesShowsDirs) {
    const dirBasename = path.basename(movieShowDir.pathname);
    const dataFilePath = new URL("./_data.json", movieShowDir);

    Logger.info(`Getting data for ${type}/${bold(dirBasename)}...`);
    if (fs.existsSync(dataFilePath)) {
      Logger.info(gray(`Data already exists, skipping...`));
      continue;
    }

    const markdownContent = fs
      .readFileSync(new URL(path.basename(movieShowDir.pathname) + ".md", movieShowDir))
      .toString();
    const movieId = matter(markdownContent).data.imdb;
    const response = (await fetch(
      `https://imdb-api.com/en/API/Title/${apiKey}/${movieId}/Posters`,
    ).then((response) => response.json())) as MovieData;
    const { image } = response;
    const resultData = {
      title: response.title,
      id: response.id,
      plot: response.plot,
      releaseDate: response.releaseDate,
      runtimeStr: response.runtimeStr,
      year: response.year,
      companies: response.companyList.map((company) => company.name),
      genres: response.genreList.map((genre) => genre.value),
    };

    fs.writeFileSync(dataFilePath, JSON.stringify(resultData, null, 2));
    Logger.success(`Data saved for ${bold(dirBasename)}!`);

    const coverURL = image;
    const coverData = await fetch(coverURL).then((response) => response.arrayBuffer());
    const coverPath = new URL("./cover.png", movieShowDir);
    if (!coverURL.endsWith("png")) {
      sharp(coverData).toFile(coverPath.pathname);
    } else {
      fs.writeFileSync(coverPath, Buffer.from(coverData));
    }

    fs.writeFileSync(coverPath, Buffer.from(coverData));
    Logger.success(`Cover saved for ${bold(dirBasename)}!`);
  }

  return moviesShowsDirs.length;
}
