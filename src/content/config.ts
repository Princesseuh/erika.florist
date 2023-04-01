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

export const collections = {
  blog: blogCollection,
  wiki: wikiCollection,
  projects: projectCollection,
};
