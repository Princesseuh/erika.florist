// Trying to import those type in a .astro file creates a weird error so we re-export it from here
import type { MarkdownHeading } from "@astrojs/markdown-remark"
import type { GetStaticPaths, MDXInstance, Page } from "astro"
import type { WikiItem } from "./wiki"

interface BaseFrontmatter {
  slug: string
  socialImage: boolean
  url: URL
}

// HACK: Using MDXInstance<WikiItem> directly inside the template leads to an error due to an issue in Astro
// See: https://github.com/withastro/astro/issues/3793
type WikiItemInstance = MDXInstance<WikiItem>

export type {
  BaseFrontmatter,
  Page,
  GetStaticPaths,
  WikiItemInstance,
  MDXInstance,
  MarkdownHeading,
}
