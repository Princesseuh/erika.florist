import type { CollectionEntry } from "astro:content";
import fs from "node:fs/promises";
import path from "node:path";

export type allCatalogueTypes = CollectionEntry<"games"> | CollectionEntry<"books">;

export async function getCatalogueData(entry: allCatalogueTypes) {
  // HACK: Replace with data collections once I figure a directory structure that's not painful
  const metadataPath = import.meta.env.DEV
    ? path.join(path.dirname(entry.data.cover.src), "./_data.json")
    : path.join(
        path.dirname(entry.data.cover.src),
        `../src/content/${entry.data.type}s/`,
        entry.slug.split("/")[0]!,
        "./_data.json",
      );
  return JSON.parse((await fs.readFile("./" + metadataPath)).toString());
}

export function isCatalogueGame(entry: allCatalogueTypes): entry is CollectionEntry<"games"> {
  return entry.data.type === "game";
}

export function isCatalogueBook(entry: allCatalogueTypes): entry is CollectionEntry<"books"> {
  return entry.data.type === "book";
}
