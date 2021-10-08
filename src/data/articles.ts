import type { BaseObject } from "./shared"
import { postProcessBase } from "./shared"
import { readableDate } from "../utils"

interface Article extends BaseObject {
  title: string
  tagline?: string
  date: Date
  dateString?: string
  tags: string[]
}

// TODO: At the moment, Astro doesn't support using fetchContent outside its components so our data fetching logic has
// to be somewhere else instead of here, but in the future I'd like for all data fetching to happen in files in this folder
// Until then, those files are full of post processing functions used to add various processed data to our objects

function postProcessArticle(article: Article): Article {
  article = postProcessBase(article) as Article
  article.dateString = readableDate(new Date(article.date)) // NOTE: For some reason, our date become a string, weird

  return article
}

export { Article, postProcessArticle }
