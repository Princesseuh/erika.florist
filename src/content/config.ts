import { glob, type Loader } from "astro/loaders";
import { defineCollection, z } from "astro:content";
import fs from "node:fs";
import path from "node:path";

const generateSlug = ((options) => {
	if (options.data.slug) return options.data.slug as string;
	return path.basename(options.entry, ".mdoc");
}) satisfies Parameters<typeof glob>[0]["generateId"];

const catalogueGlob = (type: "games" | "movies" | "books" | "shows") => {
	const originalGlob = glob({
		base: `./content/${type}`,
		pattern: "**/*.mdoc",
		generateId: generateSlug,
	});

	return {
		...originalGlob,
		async load(context) {
			await originalGlob.load(context);

			const originalEntries = Array.from(context.store.entries());
			context.store.clear();

			for (const entry of originalEntries) {
				if (!entry[1].filePath) continue;

				const metadataPath = path.join(path.dirname(entry[1].filePath), "./_data.json");
				const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

				context.store.set({
					...entry[1],
					data: { ...entry[1].data, metadata: metadata },
				});
			}
		},
	} satisfies Loader;
};

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
		date: z.date(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		type: z.literal("blog").default("blog"),
	}),
});

const wikiCollection = defineCollection({
	loader: glob({
		base: "./content/wiki",
		pattern: "**/*.mdoc",
		generateId: generateSlug,
	}),
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

const ratingSchema = z.union([
	z.literal("masterpiece"),
	z.literal("loved"),
	z.literal("liked"),
	z.literal("okay"),
	z.literal("disliked"),
	z.literal("hated"),
]);
export type CatalogueRating = z.infer<typeof ratingSchema>;

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
	books: booksCollection,
	games: gamesCollection,
	movies: moviesCollection,
	shows: showsCollection,
};
