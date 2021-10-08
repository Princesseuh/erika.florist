import { postProcessBase, BaseObject } from "./shared"

interface WikiItem extends BaseObject {
  title: string
  tagline?: string
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
