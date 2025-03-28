/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { type CatalogueType, type allCatalogueTypes } from "$data/catalogue";
import { getConfiguredImageService, getImage } from "astro:assets";
import { getCollection } from "astro:content";
import { Catalogue, Cover, db } from "astro:db";
import type { LocalImageServiceWithPlaceholder } from "src/imageService";

// https://astro.build/db/seed
export default async function seed() {
	const t0 = performance.now();
	await prepareDB();
	const t1 = performance.now();
	console.log(`Seeding time: ${t1 - t0} milliseconds.`);
}

export async function prepareDB() {
	const games = await getCollection("games");
	const movies = await getCollection("movies");
	const shows = await getCollection("shows");
	const books = await getCollection("books");

	const catalogueContent = [...games, ...movies, ...shows, ...books];
	for (const entry of catalogueContent) {
		await addCatalogueEntry(entry);
	}
}

export async function addCatalogueEntry(entry: allCatalogueTypes) {
	const { cover, type, metadata, ...data } = entry.data;
	const [processedCover, placeholderURL] = await getCoverAndPlaceholder(cover);

	const coverId = await db
		.insert(Cover)
		.values({
			src: processedCover.src,
			width: processedCover.attributes.width,
			height: processedCover.attributes.height,
			placeholder: placeholderURL,
		})
		.returning({ id: Cover.id });

	const firstCoverId = coverId[0]?.id ?? -1;

	const author = getAuthorFromEntryMetadata(type, metadata);
	const insertData = {
		type: type,
		title: data.title,
		rating: data.rating,
		cover: firstCoverId,
		author: author,
		finishedDate: data.finishedDate === "N/A" ? null : data.finishedDate.getTime(),
		platform: entry.data.type === "book" || entry.data.type === "game" ? entry.data.platform : null,
		metadata: JSON.stringify(metadata),
	};

	await db.insert(Catalogue).values(insertData);
}

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
			return metadata?.companies[0] ?? "Unknown";
	}
}
