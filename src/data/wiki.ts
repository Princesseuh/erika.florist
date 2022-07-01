import { BaseFrontmatter } from "./shared"
import { execSync } from "child_process"
import { getBaseSiteURL, getSlugFromFile } from "$utils"
import { MarkdownInstance } from "astro"

interface WikiItem extends BaseFrontmatter {
  title: string
  tagline?: string
  lastModified?: Date
  lastModifiedCommitUrl?: URL
  maxDepthTOC: number
  navigation: {
    label?: string
    category: string
    order: number
    hidden?: boolean
  }
}

function postProcessWikiItem(wikiItem: WikiItem, file: string): WikiItem {
  wikiItem.slug = getSlugFromFile(file)

  // If we don't have an order, we set it to 0 which won't affect the sort
  wikiItem.navigation.order ??= 0

  if (import.meta.env.PROD) {
    // Get the last modified time and commit ref from Git as getting it from file system is not accurate
    // PERF: This is slow, we should attempt to do it once for the entire website instead of once per file
    const gitInfoRaw = execSync(`git log -1 --date=iso --pretty="format:%cI|%H" -- ${file}`)
      .toString()
      .split("|")

    const gitInfo = {
      date: gitInfoRaw[0],
      ref: gitInfoRaw[1],
    }

    wikiItem.lastModified = new Date(gitInfo.date)
    wikiItem.lastModifiedCommitUrl = new URL(
      gitInfo.ref,
      "https://github.com/Princesseuh/princesseuh.dev/commit/",
    )
  } else {
    // In dev, we just set those to the current date and the website URL, to avoid useless work
    wikiItem.lastModified = new Date()
    wikiItem.lastModifiedCommitUrl = new URL("/", getBaseSiteURL())
  }

  wikiItem.url = new URL(
    `/wiki/${wikiItem.navigation.category}/${wikiItem.slug}/`,
    getBaseSiteURL(),
  )

  return wikiItem
}

function getWikiItemsByCategory(
  wikiItems: MarkdownInstance<WikiItem>[],
  key: string,
): MarkdownInstance<WikiItem>[] {
  return wikiItems
    .filter((wikiItem: MarkdownInstance<WikiItem>) => {
      return (
        wikiItem.frontmatter.navigation.category === key && !wikiItem.frontmatter.navigation.hidden
      )
    })
    .sort((a: MarkdownInstance<WikiItem>, b: MarkdownInstance<WikiItem>) => {
      return a.frontmatter.navigation.order - b.frontmatter.navigation.order
    })
}

export { WikiItem, postProcessWikiItem, getWikiItemsByCategory }
