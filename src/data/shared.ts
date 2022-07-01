// Trying to import those type in a .astro file creates a weird error so we re-export it from here
import type { GetStaticPaths, MarkdownInstance, Page } from "astro"
import type { WikiItem } from "./wiki"

interface BaseFrontmatter {
  slug: string
  socialImage: boolean
  url: URL
}

// HACK: Using MarkdownInstance<WikiItem> directly inside the template leads to a weird error in Astro
type WikiItemInstance = MarkdownInstance<WikiItem>

export type { BaseFrontmatter, Page, GetStaticPaths, WikiItemInstance, MarkdownInstance }
