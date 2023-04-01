import { getBaseSiteURL } from "$utils";
import type { CollectionEntry } from "astro:content";
import { execSync } from "child_process";

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

export { getLastModified, getWikiItemsByCategory };
