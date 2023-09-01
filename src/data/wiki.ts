import { getBaseSiteURL, getURLFromEntry } from "$utils";
import { getCollection, type CollectionEntry } from "astro:content";
import { execSync } from "child_process";
import type { MenuItem } from "./sidebarMenu";
import { wikiCategories, type WikiCategory } from "./wikiCategories";

const gitInfoRaw = execSync("bash ./scripts/getLastModified.sh").toString().split(";").slice(0, -1);
const gitInfo = gitInfoRaw.map((info) => {
	const [file, date, ref] = info.split("|");

	if (!date || !file || !ref) {
		throw new Error("Couldn't parse file info from " + info);
	}

	return {
		file,
		date: date.trim(),
		ref,
	};
});

function getLastModified(entry: CollectionEntry<"wiki">) {
	const info = gitInfo.find((info) => info.file.endsWith(entry.id));

	if (import.meta.env.PROD) {
		if (!info) {
			throw new Error(
				`Couldn't find commit information for ${entry.id}. Make sure to create a commit before building`,
			);
		}

		return {
			lastModifiedDate: new Date(info.date),
			lastModifiedCommitUrl: new URL(
				info.ref,
				"https://github.com/Princesseuh/erika.florist/commit/",
			),
		};
	}

	return {
		lastModifiedDate: new Date(),
		lastModifiedCommitUrl: new URL("/", getBaseSiteURL()),
	};
}

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

async function getWikiNavigation(currentPage: URL): Promise<MenuItem[]> {
	const wikiItems = await getCollection("wiki");
	const navigation: MenuItem[] = [];
	wikiCategories.map((category: WikiCategory) => {
		navigation.push({ type: "header", label: category.title });
		const subItems = getWikiItemsByCategory(wikiItems, category.key).map(
			(item: CollectionEntry<"wiki">) => {
				const itemUrl = getURLFromEntry(item);
				return {
					label: item.data.navigation.label || item.data.title,
					link: itemUrl,
					isCurrent: currentPage.pathname == itemUrl,
					type: "link" as MenuItem["type"],
				};
			},
		);

		navigation.push(...subItems);
	});

	return navigation;
}

export { getLastModified, getWikiNavigation };
