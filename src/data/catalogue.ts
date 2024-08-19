import type { CollectionEntry } from "astro:content";
import type { CatalogueRating } from "src/content/config";

export type allCatalogueTypes =
	| CollectionEntry<"games">
	| CollectionEntry<"books">
	| CollectionEntry<"movies">
	| CollectionEntry<"shows">;

export type CatalogueType = allCatalogueTypes["data"]["type"];

export function isCatalogueGame(entry: allCatalogueTypes): entry is CollectionEntry<"games"> {
	return entry.data.type === "game";
}

export function isCatalogueBook(entry: allCatalogueTypes): entry is CollectionEntry<"books"> {
	return entry.data.type === "book";
}

export function isCatalogueMovie(entry: allCatalogueTypes): entry is CollectionEntry<"movies"> {
	return entry.data.type === "movie";
}

const capitalize = <T extends string>(s: T) =>
	(s[0]?.toUpperCase() + s.slice(1)) as Capitalize<typeof s>;

const ratingToEmoji: Record<CatalogueRating, string> = {
	hated: "🙁",
	disliked: "😕",
	okay: "😐",
	liked: "🙂",
	loved: "😍",
	masterpiece: "❤️",
};

export function prettyRating(rating: CatalogueRating) {
	return `${capitalize(rating)} ${ratingToEmoji[rating]}`;
}
