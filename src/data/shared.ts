// Trying to import those type in a .astro file creates a weird error so we re-export it from here
export type { Page } from "astro"
export type { MarkdownInstance } from "astro"

interface BaseFrontmatter {
  slug: string
  socialImage: boolean
  url: URL
}

export { BaseFrontmatter }
