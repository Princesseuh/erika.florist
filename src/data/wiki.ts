import { getBaseSiteURL, getSlugFromFile } from "$utils";
import type { MDXInstance } from "astro";
import { execSync } from "child_process";
import type { BaseFrontmatter } from "./shared";

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

interface WikiItem extends BaseFrontmatter {
  title: string;
  tagline?: string;
  lastModified: Date;
  lastModifiedCommitUrl?: URL;
  maxDepthTOC: number;
  navigation: {
    label?: string;
    category: string;
    order: number;
    hidden?: boolean;
  };
}

function postProcessWikiItem(wikiItem: WikiItem, file: string): WikiItem {
  wikiItem.slug = getSlugFromFile(file);

  // If we don't have an order, we set it to 0 which won't affect the sort
  wikiItem.navigation.order ??= 0;

  if (import.meta.env.PROD) {
    const info = gitInfo.find((info) => file.endsWith(info.file));

    if (!info) {
      throw new Error(
        `Couldn't find commit information for ${file}. Make sure to create a commit before building`,
      );
    }

    wikiItem.lastModified = new Date(info.date);
    wikiItem.lastModifiedCommitUrl = new URL(
      info.ref,
      "https://github.com/Princesseuh/erika.florist/commit/",
    );
  } else {
    // In dev, when working on new pages we don't have a git commit yet, so data gets garbled
    wikiItem.lastModified = new Date();
    wikiItem.lastModifiedCommitUrl = new URL("/", getBaseSiteURL());
  }

  wikiItem.url = new URL(
    `/wiki/${wikiItem.navigation.category}/${wikiItem.slug}/`,
    getBaseSiteURL(),
  );

  return wikiItem;
}

function getWikiItemsByCategory(
  wikiItems: MDXInstance<WikiItem>[],
  key: string,
): MDXInstance<WikiItem>[] {
  return wikiItems
    .filter((wikiItem: MDXInstance<WikiItem>) => {
      return (
        wikiItem.frontmatter.navigation.category === key && !wikiItem.frontmatter.navigation.hidden
      );
    })
    .sort((a: MDXInstance<WikiItem>, b: MDXInstance<WikiItem>) => {
      return a.frontmatter.navigation.order - b.frontmatter.navigation.order;
    });
}

export { postProcessWikiItem, getWikiItemsByCategory };
export type { WikiItem };
