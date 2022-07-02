import { BaseFrontmatter } from "./shared"
import { execSync } from "child_process"
import { getBaseSiteURL, getSlugFromFile } from "$utils"
import { MarkdownInstance } from "astro"

const gitInfoRaw = execSync("bash ./scripts/getLastModified.sh").toString().split(";")
const gitInfo = gitInfoRaw.map((info) => {
  const [file, date, ref] = info.split("|")

  return {
    file: file.trim(),
    date,
    ref,
  }
})

interface WikiItem extends BaseFrontmatter {
  title: string
  tagline?: string
  lastModified: Date
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = gitInfo.find((info) => file.endsWith(info.file))!

    wikiItem.lastModified = new Date(info.date)
    wikiItem.lastModifiedCommitUrl = new URL(
      info.ref,
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
