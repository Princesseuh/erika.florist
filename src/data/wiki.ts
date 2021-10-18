import { postProcessBase, BaseObject } from "./shared"
import { execSync } from "child_process"

interface WikiItem extends BaseObject {
  title: string
  tagline?: string
  lastModified?: Date
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
  wikiItem.navigation.order = wikiItem.navigation.order ?? 0

  // Get the last modified time from Git as getting it from file system is not accurate
  // PERF: This can be a bit slow, in Eleventy it used to slow down my builds a lot
  const isoDate = execSync(
    `git log -1 --date=iso --pretty="format:%cI" ${wikiItem.file.pathname}`,
  ).toString()
  wikiItem.lastModified = new Date(Date.parse(isoDate))

  wikiItem.url = new URL(
    `/wiki/${wikiItem.navigation.category}/${wikiItem.slug}`,
    "http://localhost:3000/",
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
