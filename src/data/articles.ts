import { getBaseSiteURL } from "$utils"
import type { BaseObject } from "./shared"
import { postProcessBase } from "./shared"

interface Article extends BaseObject {
  title: string
  tagline?: string
  date: Date
  tags: string[]
}

function postProcessArticle(article: Article): Article {
  article = postProcessBase(article) as Article

  article.url = new URL(`/article/${article.slug}`, getBaseSiteURL())

  // NOTE: For some reason, Astro transform our dates into string so let's check for that and return a proper date
  if (typeof article.date === "string") {
    article.date = new Date(article.date)
  }

  return article
}

export { Article, postProcessArticle }
