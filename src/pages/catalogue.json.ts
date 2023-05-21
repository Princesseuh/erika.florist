import { getCatalogueData } from "$data/catalogue";
import type { APIRoute, ImageMetadata } from "astro";
import { getConfiguredImageService, getImage } from "astro:assets";
import { getCollection } from "astro:content";
import type { LocalImageServiceWithPlaceholder } from "src/imageService";

async function getCoverAndPlaceholder(cover: ImageMetadata) {
  return await Promise.all([
    getImage({ src: cover, width: 240 }),
    (async () => {
      const imageService = (await getConfiguredImageService()) as LocalImageServiceWithPlaceholder;
      const placeholderURL = await imageService.generatePlaceholder(
        cover.src,
        cover.width,
        cover.height,
      );
      return placeholderURL;
    })(),
  ]);
}

export const get = (async () => {
  const books = await getCollection("books");
  const processedBooks = await Promise.all(
    books.map(async (book) => {
      const { isbn, cover, ...bookData } = book.data;
      const [processedCover, placeholderURL] = await getCoverAndPlaceholder(cover);

      const metadata = await getCatalogueData(book);
      const author = metadata.authors[0];

      return {
        cover: {
          src: processedCover.src,
          width: processedCover.attributes.width,
          height: processedCover.attributes.height,
          placeholder: placeholderURL,
        },
        author: author,
        ...bookData,
      };
    }),
  );
  const games = await getCollection("games");
  const processedGames = await Promise.all(
    games.map(async (game) => {
      const { igdb, cover, ...gameData } = game.data;
      const [processedCover, placeholderURL] = await getCoverAndPlaceholder(cover);

      const metadata = await getCatalogueData(game);
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
  const catalogueContent = [...processedGames, ...processedBooks].sort((a, b) => {
    if (a.finishedDate === "N/A" || b.finishedDate === "N/A") {
      return 0;
    }

    return b.finishedDate.getTime() - a.finishedDate.getTime();
  });

  return {
    body: JSON.stringify(catalogueContent),
    encoding: "utf-8",
  };
}) satisfies APIRoute;
