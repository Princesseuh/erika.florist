/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { CatalogueType } from "$data/catalogue";
import type { APIRoute } from "astro";
import { getConfiguredImageService, getImage } from "astro:assets";
import { getCollection } from "astro:content";
import pkg from "deterministic-object-hash";
import type { CatalogueRating } from "src/content/config";
import type { LocalImageServiceWithPlaceholder } from "src/imageService";

const games = await getCollection("games");
const movies = await getCollection("movies");
const shows = await getCollection("shows");
const books = await getCollection("books");

const VERSION = 1;

const catalogueContent = [...games, ...movies, ...shows, ...books].map((entry) => ({
	id: entry.id,
	data: entry.data,
}));

export const versionHash = await (
	pkg as unknown as {
		default: typeof pkg;
	}
).default([VERSION, catalogueContent]);

async function getCoverAndPlaceholder(cover: ImageMetadata) {
	return await Promise.all([
		getImage({ src: cover, width: 240 }),
		(async () => {
			const imageService = (await getConfiguredImageService()) as LocalImageServiceWithPlaceholder;
			const placeholderURL = await imageService.generateThumbhash(cover, cover.width, cover.height);
			return placeholderURL;
		})(),
	]);
}

// TODO: Type this properly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAuthorFromEntryMetadata(type: CatalogueType, metadata: any) {
	switch (type) {
		case "game":
			return metadata?.companies?.[0]?.name ?? "Unknown";
		case "book":
			return metadata.authors?.[0] ?? metadata.publishers[0] ?? "Unknown";
		case "movie":
		case "show":
			return metadata?.companies?.[0] ?? "Unknown";
	}
}

function ratingToNumber(rating: CatalogueRating): number {
	switch (rating) {
		case "masterpiece":
			return 5;
		case "loved":
			return 4;
		case "liked":
			return 3;
		case "okay":
			return 2;
		case "disliked":
			return 1;
		case "hated":
			return 0;
	}
}

export const GET = (async () => {
	const data = await Promise.all(
		catalogueContent.map(async (entry) => {
			const { cover, type, metadata, ...entryData } = entry.data;
			const [processedCover, placeholderURL] = await getCoverAndPlaceholder(cover);

			const author = getAuthorFromEntryMetadata(type, metadata);

			return {
				id: entry.id,
				cover: processedCover.src,
				placeholder: placeholderURL,
				type,
				title: entryData.title,
				rating: ratingToNumber(entryData.rating),
				author: author,
				...(entryData.finishedDate === "N/A"
					? {}
					: {
							finishedDate: entryData.finishedDate.getTime(),
						}),
			};
		}),
	);

	return new Response(
		JSON.stringify({
			version: versionHash,
			content: data,
		}),
		{
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=0, must-revalidate, stale-while-revalidate=3600",
			},
		},
	);
}) satisfies APIRoute;
