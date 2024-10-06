import { getURLFromEntry } from "$utils";
import { getCollection, type CollectionEntry } from "astro:content";
import type { MenuItem } from "./sidebarMenu";
import { wikiCategories, type WikiCategory } from "./wikiCategories";

function getWikiItemsByCategory(
	wikiItems: CollectionEntry<"wiki">[],
	key: string,
): CollectionEntry<"wiki">[] {
	return wikiItems
		.filter((wikiItem: CollectionEntry<"wiki">) => {
			return wikiItem.data.navigation.category === key && !wikiItem.data.navigation.hidden;
		})
		.sort((a: CollectionEntry<"wiki">, b: CollectionEntry<"wiki">) => {
			return a.data.navigation.order - b.data.navigation.order;
		});
}

export async function getWikiNavigation(currentPage: URL): Promise<MenuItem[]> {
	const wikiItems = await getCollection("wiki");
	const navigation: MenuItem[] = [];
	wikiCategories.map((category: WikiCategory) => {
		navigation.push({ type: "header", label: category.title });
		const subItems = getWikiItemsByCategory(wikiItems, category.key).map(
			(item: CollectionEntry<"wiki">) => {
				const itemUrl = getURLFromEntry(item);
				return {
					label: item.data.navigation.label ?? item.data.title,
					link: itemUrl,
					isCurrent: currentPage.pathname === itemUrl,
					type: "link" as MenuItem["type"],
				};
			},
		);

		navigation.push(...subItems);
	});

	return navigation;
}
