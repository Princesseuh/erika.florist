import type { CollectionEntry } from "astro:content";
export { readableDate } from "./dateTools";
export { getPlaceholderURL } from "./placeholder";

export function getURLFromEntry(
  item: CollectionEntry<"blog"> | CollectionEntry<"projects"> | CollectionEntry<"wiki">,
): string {
  switch (item.data.type) {
    case "blog":
      return `/article/${item.slug}`;
    case "wiki":
      return `/wiki/${item.data.navigation?.category}/${item.slug}`;
    case "project":
      return `/projects/${item.data.projectType}/${item.slug}`;
    default:
      return "ERROR!";
  }
}

export function getBaseSiteURL(): string {
  return import.meta.env.PROD ? "https://erika.florist/" : "http://localhost:3000/";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function randomArrayEntry<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)] as T;
}
