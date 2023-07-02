import "dotenv/config";
import matter from "gray-matter";
import igdb from "igdb-api-node";
import { bold, gray } from "kleur/colors";
import fs from "node:fs";
import path from "node:path";
import { Logger, getContentDirs } from "./catalogueUtils";

async function getAccessToken() {
  const response = await (
    await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT}&client_secret=${process.env.IGDB_KEY}&grant_type=client_credentials`,
      {
        method: "POST",
      },
    )
  ).json();

  return response.access_token;
}

export interface GameData {
  id: number;
  cover: {
    id: number;
    image_id: string;
  };
  first_release_date: number;
  genres: { id: number; name: string }[];
  involved_companies: {
    id: number;
    company: { id: number; name: string };
    developer: boolean;
    publisher: boolean;
    supporting: boolean;
  }[];
  platforms: { id: number; abbreviation: string }[];
}

export async function getDataForGames() {
  const accessToken = await getAccessToken();
  // @ts-expect-error Some sort of weirdness with igdb-api-node, don't get it
  const client = igdb.default(process.env.IGDB_CLIENT, accessToken);

  const gamesDirs = getContentDirs("games");

  for (const gameDir of gamesDirs) {
    const dirBasename = path.basename(decodeURI(gameDir.pathname));
    const dataFilePath = new URL("./_data.json", gameDir);

    Logger.info(`Getting data for ${bold(dirBasename)}...`);
    if (fs.existsSync(dataFilePath)) {
      Logger.info(gray(`Data already exists, skipping...`));
      continue;
    }

    const markdownContent = fs
      .readFileSync(new URL(path.basename(gameDir.pathname) + ".md", gameDir))
      .toString();
    const gameID = matter(markdownContent).data.igdb;
    const response = await client
      .fields([
        "genres.name",
        "first_release_date",
        "cover.image_id",
        "platforms.abbreviation",
        "involved_companies.developer",
        "involved_companies.publisher",
        "involved_companies.supporting",
        "involved_companies.company.name",
      ])
      .where(`id = ${gameID}`)
      .limit(1)
      .request("/games");

    const gameData = response.data[0] as GameData;
    const { id, cover, involved_companies, ...cleanedData } = gameData;
    const resultData = {
      ...cleanedData,
      companies: gameData.involved_companies
        .filter((company) => !company.supporting)
        .map((company) => ({
          id: company.company.id,
          name: company.company.name,
          role: company.developer === true ? "developer" : "publisher",
        })),
    };

    fs.writeFileSync(dataFilePath, JSON.stringify(resultData, null, 2));
    Logger.success(`Data saved for ${bold(dirBasename)}!`);

    const coverPath = new URL("./cover.png", gameDir);
    const coverURL = `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${gameData.cover.image_id}.png`;
    const coverData = await (await fetch(coverURL)).arrayBuffer();
    Logger.success(`Cover saved for ${bold(dirBasename)}!`);

    fs.writeFileSync(coverPath, Buffer.from(coverData));
  }

  return gamesDirs.length;
}
