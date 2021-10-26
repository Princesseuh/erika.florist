import type { BaseObject } from "./shared"
import { postProcessBase } from "./shared"
import { basename, dirname } from "path"

enum CatalogueType {
  GAME = "game",
  BOOK = "book",
  MOVIE = "movie",
  SHOW = "show",
}

interface CatalogueItemBase extends BaseObject {
  type: CatalogueType // This isn't used to generate pages (we know the types from Typescript), it's used for the list so it can filter by type
  title: string
  genre: string
  started_on: Date
  ended_on?: Date // If we don't have an ended_on, it means it was done in a day (for movies, one shots etc)
  cover?: URL
  cover_alt: string // Used for alt attribute on the cover, a11y yay
}

// The books type really is two type of content, it can either be single books or multiple books in one entry.
// Unfortunately, we want different metadata depending on that variable, for instance, it doesn't make sense to list
// the number of pages for a collection of books. It's much more interesting to write the number of volumes or chapters, in the case of mangas
interface CatalogueBookBase extends CatalogueItemBase {
  formatType: string
  author: string
}

interface CatalogueBookSingle extends CatalogueBookBase {
  pages: number
  format: string // We only care about the format for single books because the format can vary between volumes in a collection
}

interface CatalogueBookMultiple extends CatalogueBookBase {
  chapters?: number // The number of chapters is really only interesting in the case of mangas, so we'll mark it as optional
  volumes: number
}

// I don't want to at the moment, but perhaps it'd be cool to make types for developers and platforms
interface CatalogueGame extends CatalogueItemBase {
  developer: string
  playtime: number
  platform: string
}

type CatalogueItem = CatalogueGame | CatalogueBookSingle | CatalogueBookMultiple

function postProcessCatalogueItem(item: CatalogueItem): CatalogueItem {
  item = postProcessBase(item) as CatalogueItem

  item.type = getCatalogueTypeFromURL(item.file.pathname)
  item.url = getCatalogueURL(item)
  item.cover = new URL(item.url + ".jpg")

  item.started_on = new Date(item.started_on)
  if (item.ended_on) {
    item.ended_on = new Date(item.ended_on)
  }

  switch (item.type) {
    case CatalogueType.GAME:
      break
    case CatalogueType.BOOK:
      item.formatType = item?.volumes ? "multiple" : "single"
      break
  }

  return item
}

function getCatalogueTypeFromURL(path: string): CatalogueType {
  return basename(dirname(path)).slice(0, -1) as CatalogueType
}

function getCatalogueURL(item: CatalogueItem): URL {
  return new URL(`/catalogue/${item.type}s/${item.slug}`, "http://localhost:3000/")
}

export { postProcessCatalogueItem, CatalogueItem, CatalogueType }
