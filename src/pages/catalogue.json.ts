import type { APIRoute } from "astro";
import { getConfiguredImageService, getImage } from "astro:assets";
import { getCollection } from "astro:content";
import { readFile } from "fs/promises";
import path from "node:path";
import type { LocalImageServiceWithPlaceholder } from "src/imageService";

export const get = (async () => {
  // const books = await getCollection("books");
  const games = await getCollection("games");
  const processedGames = await Promise.all(
    games.map(async (game) => {
      const { igdb, cover, ...gameData } = game.data;
      const processedCover = await getImage({ src: cover, width: 240 });
      const imageService = (await getConfiguredImageService()) as LocalImageServiceWithPlaceholder;
      const placeholderURL = await imageService.generatePlaceholder(
        cover.src,
        cover.width,
        cover.height,
      );

      console.log(game);
      const metadataPath = import.meta.env.DEV
        ? path.join(path.dirname(cover.src), "./data.json")
        : path.join(
            path.dirname(cover.src),
            "../src/content/games/",
            game.slug.split("/")[0]!,
            "./data.json",
          );
      const metadata = JSON.parse((await readFile("./" + metadataPath)).toString());
      const author = metadata.companies.find((company: any) => company.role === "developer")?.name;

      return {
        cover: {
          src: processedCover.src,
          width: processedCover.attributes.width,
          height: processedCover.attributes.height,
          placeholder: placeholderURL,
        },
        author: author,
        ...gameData,
      };
    }),
  );
  const catalogueContent = [...processedGames];

  return {
    body: JSON.stringify(catalogueContent),
    encoding: "utf-8",
  };
}) satisfies APIRoute;
