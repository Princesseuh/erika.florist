import { getConfiguredImageService, getImage } from "astro:assets";
import { getCollection } from "astro:content";
import SQLite from "better-sqlite3";
import { rm } from "fs/promises";
import { Kysely, SqliteDialect, type Generated } from "kysely";
import type { CatalogueRating } from "src/content/config";
import type { LocalImageServiceWithPlaceholder } from "src/imageService";
import { getCatalogueData, type CatalogueType, type allCatalogueTypes } from "./catalogue";

interface Database {
	cover: CoverTable;
	catalogue: CatalogueTable;
}

type CoverTable = {
	id: Generated<number>;
	src: string;
	width: number;
	height: number;
	placeholder: string;
};

type CatalogueTable = {
	id: Generated<number>;
	type: "game" | "show" | "book" | "movie";
	title: string;
	author: string;
	cover: number;
	rating: CatalogueRating;
	finishedDate: number | null;
	platform: string | null;
	metadata: string;
};

let db: Kysely<Database>;

export async function createDatabase() {
	try {
		await rm("./api/cataloguedb.db");
	} catch {
		// Ignore, it's fine
	}

	const dialect = new SqliteDialect({
		database: new SQLite("./api/cataloguedb.db"),
	});

	db = new Kysely<Database>({
		dialect,
	});

	initDatabase();

	const games = await getCollection("games");
	const movies = await getCollection("movies");
	const shows = await getCollection("shows");
	const books = await getCollection("books");

	const catalogueContent = [...games, ...movies, ...shows, ...books];
	for (const entry of catalogueContent) {
		await addCatalogueEntry(entry);
	}
}

function initDatabase() {
	db.schema
		.createTable("cover")
		.ifNotExists()
		.addColumn("id", "integer", (id) => id.autoIncrement().primaryKey())
		.addColumn("src", "text")
		.addColumn("width", "integer")
		.addColumn("height", "integer")
		.addColumn("placeholder", "text")
		.execute();

	db.schema
		.createTable("catalogue")
		.ifNotExists()
		.addColumn("id", "integer", (id) => id.autoIncrement().primaryKey())
		.addColumn("type", "text", (title) => title.notNull())
		.addColumn("title", "text", (title) => title.notNull())
		.addColumn("author", "text", (author) => author.notNull())
		.addColumn("cover", "integer", (cover) => cover.references("cover.id"))
		.addColumn("rating", "text", (rating) => rating.notNull())
		.addColumn("finishedDate", "integer")
		.addColumn("platform", "text")
		.addColumn("metadata", "json", (metadata) => metadata.notNull())
		.execute();
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
			return metadata.companies[0].name;
		case "book":
			return metadata.authors[0] ?? "Unknown";
		case "movie":
		case "show":
			return metadata.companies[0];
	}
}

export async function addCatalogueEntry(entry: allCatalogueTypes) {
	const { cover, type, ...data } = entry.data;
	const [processedCover, placeholderURL] = await getCoverAndPlaceholder(cover);
	const metadata = await getCatalogueData(entry);

	const author = getAuthorFromEntryMetadata(type, metadata);
	const coverId = await db
		.insertInto("cover")
		.values({
			src: processedCover.src,
			width: processedCover.attributes.width,
			height: processedCover.attributes.height,
			placeholder: placeholderURL,
		})
		.returning("id as id")
		.executeTakeFirst();

	const insertData = {
		type: type,
		title: data.title,
		rating: data.rating,
		cover: coverId?.id ?? -1,
		author: author,
		finishedDate: data.finishedDate === "N/A" ? null : data.finishedDate.getTime(),
		platform: entry.data.type === "book" || entry.data.type === "game" ? entry.data.platform : null,
		metadata: JSON.stringify(metadata),
	};

	const id = await db.insertInto("catalogue").values(insertData).returningAll().executeTakeFirst();
	return id;
}
