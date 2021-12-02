import { getBaseSiteURL } from "$utils"
import type { BaseObject } from "./shared"
import { postProcessBase } from "./shared"

interface Article extends BaseObject {
  title: string
  tagline?: string
  date: Date
  tags: string[]
}

// TODO: At the moment, Astro doesn't support using fetchContent outside its components so our data fetching logic has
// to be somewhere else instead of here, but in the future I'd like for all data fetching to happen in files in this folder
// Until then, those files are full of post processing functions used to add various processed data to our objects

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
