import { defineCollection, z } from "astro:content";

const blogCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    date: z.date(),
    tags: z.array(z.string()).default([]),
    type: z.literal("blog").default("blog"),
  }),
});

const wikiCollection = defineCollection({
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

const booksCollection = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      rating: ratingSchema,
      platform: z.union([z.literal("ebook"), z.literal("physical")]),
      finishedDate: z.date(),
      cover: z.preprocess(() => "./cover.png", image()),
      isbn: z.string(),
      type: z.literal("book").default("book"),
    }),
});

const gamesCollection = defineCollection({
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
      ]),
      finishedDate: z.union([z.date(), z.literal("N/A")]),
      type: z.literal("game").default("game"),
      igdb: z.number(),
      cover: z.preprocess(() => "./cover.png", image()),
    }),
});

export const collections = {
  blog: blogCollection,
  wiki: wikiCollection,
  projects: projectCollection,
  books: booksCollection,
  games: gamesCollection,
};
