import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";
import { catalogueGlob, generateSlug, ratingSchema, wikiGlob } from "./config-utils.js";

const blogCollection = defineCollection({
	loader: glob({
		base: "./content/blog",
		pattern: "**/*.mdoc",
		generateId: generateSlug,
	}),
	schema: z.object({
		title: z.string().describe("Title of the blog post"),
		tagline: z.string().optional(),
		maxDepthTOC: z.number().optional(),
		featured: z.boolean().optional(),
		date: z.date(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		type: z.literal("blog").default("blog"),
	}),
});

const wikiCollection = defineCollection({
	loader: wikiGlob(),
	schema: z.object({
		title: z.string(),
		tagline: z.string().optional(),
		maxDepthTOC: z.number().optional(),
		navigation: z.object({
			label: z.string().optional(),
			category: z.string(),
			hidden: z.boolean().optional(),
			order: z.number().optional().default(0),
		}),
		type: z.literal("wiki").default("wiki"),
		lastModified: z
			.object({
				date: z.date().default(new Date()),
				commitUrl: z.string().url().default("https://erika.florist/"),
			})
			.default({}),
	}),
});

const projectCollection = defineCollection({
	loader: glob({
		base: "./content/projects",
		pattern: "**/*.mdoc",
		generateId: generateSlug,
	}),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			tagline: z.string().optional(),
			featured: z.boolean().optional(),
			indexCover: z.preprocess(() => "./cover.png", image()),
			indexCoverAlt: z.string().optional(),
			miniLogo: z.preprocess(() => "./mini-logo.png", image()),
			miniLogoAlt: z.string().optional(),
			external_url: z.string().url().optional(),
			projectType: z.union([z.literal("game"), z.literal("site"), z.literal("software")]),
			type: z.literal("project").default("project"),
		}),
});

const booksCollection = defineCollection({
	loader: catalogueGlob("books"),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			rating: ratingSchema,
			platform: z.union([z.literal("ebook"), z.literal("physical"), z.literal("audiobook")]),
			finishedDate: z.date(),
			cover: z.preprocess(() => "./cover.png", image()),
			isbn: z.string(),
			type: z.literal("book").default("book"),
			metadata: z.unknown().default({}),
		}),
});

const gamesCollection = defineCollection({
	loader: catalogueGlob("games"),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			rating: ratingSchema,
			platform: z.union([
				z.literal("pc"),
				z.literal("switch"),
				z.literal("mobile"),
				z.literal("ps3"),
				z.literal("ds"),
				z.literal("gcn"),
				z.literal("ps4"),
				z.literal("ps5"),
			]),
			finishedDate: z.union([z.date(), z.literal("N/A")]),
			type: z.literal("game").default("game"),
			igdb: z.string(),
			cover: z.preprocess(() => "./cover.png", image()),
			metadata: z.unknown().default({}),
		}),
});

const moviesCollection = defineCollection({
	loader: catalogueGlob("movies"),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			rating: ratingSchema,
			finishedDate: z.date(),
			cover: z.preprocess(() => "./cover.png", image()),
			tmdb: z.string(),
			type: z.literal("movie").default("movie"),
			metadata: z.unknown().default({}),
		}),
});

const showsCollection = defineCollection({
	loader: catalogueGlob("shows"),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			rating: ratingSchema,
			finishedDate: z.date(),
			cover: z.preprocess(() => "./cover.png", image()),
			tmdb: z.string(),
			type: z.literal("show").default("show"),
			metadata: z.unknown().default({}),
		}),
});

export const collections = {
	blog: blogCollection,
	wiki: wikiCollection,
	projects: projectCollection,

	// Catalogue
	books: booksCollection,
	games: gamesCollection,
	movies: moviesCollection,
	shows: showsCollection,
};
