import type { CollectionEntry } from "astro:content";
export { monthYearDate, readableDate } from "./dateTools";

export function getURLFromEntry(
	item: CollectionEntry<"blog"> | CollectionEntry<"projects"> | CollectionEntry<"wiki">,
): string {
	switch (item.data.type) {
		case "blog":
			return `/articles/${item.slug}`;
		case "wiki":
			return `/wiki/${item.data.navigation.category}/${item.slug}`;
		case "project":
			return `/projects/${item.data.projectType}/${item.slug}`;
		default:
			return "ERROR!";
	}
}

export function getBaseSiteURL(): string {
	return import.meta.env.PROD ? "https://erika.florist/" : "http://localhost:4321/";
}

export function randomArrayEntry<T>(array: T[]): T {
	return array[Math.floor(Math.random() * array.length)] as T;
}

export const blogDateSort = (a: CollectionEntry<"blog">, b: CollectionEntry<"blog">) =>
	b.data.date.getTime() - a.data.date.getTime();
