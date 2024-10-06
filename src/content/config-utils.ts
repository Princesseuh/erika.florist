import { getBaseSiteURL } from "$utils";
import { glob, type Loader } from "astro/loaders";
import { z } from "astro:schema";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Module-level info so we don't have to recompute it every time, it's expensive!
const gitInfoRaw = execSync("bash ./scripts/getLastModified.sh").toString().split(";").slice(0, -1);
const gitInfo = gitInfoRaw.map((info) => {
	const [file, date, ref] = info.split("|");

	if (!date || !file || !ref) {
		throw new Error(`Couldn't parse file info from ${info}`);
	}

	return {
		file,
		date: date.trim(),
		ref,
	};
});

export const ratingSchema = z.union([
	z.literal("masterpiece"),
	z.literal("loved"),
	z.literal("liked"),
	z.literal("okay"),
	z.literal("disliked"),
	z.literal("hated"),
]);

export type CatalogueRating = z.infer<typeof ratingSchema>;

export const generateSlug = ((options) => {
	if (options.data.slug) return options.data.slug as string;
	return path.basename(options.entry, ".mdoc");
}) satisfies Parameters<typeof glob>[0]["generateId"];

export const catalogueGlob = (type: "games" | "movies" | "books" | "shows") => {
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
				const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as unknown;

				context.store.set({
					...entry[1],
					data: { ...entry[1].data, metadata: metadata },
				});
			}
		},
	} satisfies Loader;
};

export const wikiGlob = () => {
	const originalGlob = glob({
		base: "./content/wiki",
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

				const lastModified = getLastModified(entry[1].filePath);

				context.store.set({
					...entry[1],
					data: {
						...entry[1].data,
						lastModified: {
							date: lastModified.lastModifiedDate,
							commitUrl: lastModified.lastModifiedCommitUrl,
						},
					},
				});
			}
		},
	} satisfies Loader;
};

export function getLastModified(filePath: string) {
	const info = gitInfo.find((info) => filePath && info.file.endsWith(filePath));

	if (!info) {
		if (import.meta.env.PROD) {
			throw new Error(
				`Couldn't find commit information for ${filePath}. Make sure to create a commit before building`,
			);
		}

		return {
			lastModifiedDate: new Date(),
			lastModifiedCommitUrl: new URL("/", getBaseSiteURL()).toString(),
		};
	}

	return {
		lastModifiedDate: new Date(info.date),
		lastModifiedCommitUrl: new URL(
			info.ref,
			"https://github.com/Princesseuh/erika.florist/commit/",
		).toString(),
	};
}
