import { getBaseSiteURL, getSlugFromFile } from "$utils"
import type { BaseFrontmatter } from "./shared"

interface Article extends BaseFrontmatter {
  title: string
  tagline?: string
  date: Date
  tags: string[]
}

function postProcessArticle(article: Article, file: string): Article {
  article.slug = getSlugFromFile(file)
  article.url = new URL(`/article/${article.slug}/`, getBaseSiteURL())

  // NOTE: For some reason, Astro transform our dates into string so let's check for that and return a proper date
  if (typeof article.date === "string") {
    article.date = new Date(article.date)
  }

  return article
}

export { Article, postProcessArticle }
