import { postProcessBase, BaseObject } from "./shared"
import { execSync } from "child_process"
import { getBaseSiteURL } from "$utils"

interface WikiItem extends BaseObject {
  title: string
  tagline?: string
  lastModified?: Date
  lastModifiedCommitUrl?: URL
  navigation: {
    label?: string
    category: string
    order?: number
    hidden?: boolean
  }
}

function postProcessWikiItem(wikiItem: WikiItem): WikiItem {
  wikiItem = postProcessBase(wikiItem) as WikiItem

  // If we don't have an order, we set it to 0 which won't affect the sort
  wikiItem.navigation.order ??= 0

  if (import.meta.env.PROD) {
    // Get the last modified time and commit ref from Git as getting it from file system is not accurate
    // PERF: This is slow, it'd be great to eventually find a way to make it faster but I don't think that's possible
    // It's not a big problem though since it only happens at build
    const gitInfoRaw = execSync(
      `git log -1 --date=iso --pretty="format:%cI|%H" -- ./${wikiItem.file.pathname}`,
    )
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

function getWikiItemsByCategory(wikiItems: WikiItem[], key: string): WikiItem[] {
  return wikiItems
    .filter((wikiItem: WikiItem) => {
      return wikiItem.navigation.category === key && !wikiItem.navigation.hidden
    })
    .sort((a: WikiItem, b: WikiItem) => {
      return a.navigation.order - b.navigation.order
    })
}

export { WikiItem, postProcessWikiItem, getWikiItemsByCategory }
