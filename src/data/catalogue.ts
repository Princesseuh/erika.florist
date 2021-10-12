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

// Books are a wild beast, mangas and one shots follow much different formats than normal books does, same goes for light novels
interface CatalogueBookBase extends CatalogueItemBase {
  formatType: string
  author: string
}

// For normal books, the only special thing we want is the page count really
interface CatalogueBookSingle extends CatalogueBookBase {
  pages: number
  format: string // We only care about the format here because mangas are very rarely available in another format than physical
}

// This is mainly used for mangas and light novels which get bundled into one entry (unlike traditional books)
interface CatalogueBookMultiple extends CatalogueBookBase {
  chapters: number
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
  item.url = getCatalogueURL(item.file.pathname)
  item.cover = new URL(item.url + ".jpg")

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

function getCatalogueURL(path: string, add: string = ""): URL {
  return new URL("/" + path.split("/content/")[1].split(".")[0] + add, "http://localhost:3000/")
}

export { postProcessCatalogueItem, CatalogueItem, CatalogueType }
