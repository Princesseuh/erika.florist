import type { BaseObject } from "./shared"
import { postProcessBase } from "./shared"
import { basename, dirname } from "path"
import { generateImage, getBaseSiteURL } from "$utils"

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
  cover?: string
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
  chapters?: number // The number of chapters is really only interesting in the case of mangas, so it's optional
  volumes: number
}

interface CatalogueGame extends CatalogueItemBase {
  developer: string
  playtime: number
  platform: string
}

interface CatalogueMovie extends CatalogueItemBase {
  director: string
  length: number
}

interface CatalogueShow extends CatalogueItemBase {
  episodes: number
  platform: string
}

type CatalogueItem =
  | CatalogueGame
  | CatalogueMovie
  | CatalogueShow
  | CatalogueBookSingle
  | CatalogueBookMultiple

function postProcessCatalogueItem(item: CatalogueItem): CatalogueItem {
  item = postProcessBase(item) as CatalogueItem

  item.type = getCatalogueTypeFromURL(item.file.pathname)
  const itemBaseDir = `/catalogue/${item.type}s/${item.slug}`
  item.url = new URL(itemBaseDir, getBaseSiteURL())

  const cover = generateImage(itemBaseDir + `.jpg`, {
    widths: [300],
    formats: ["avif", "webp", "jpeg"],
  })

  function escapeHtml(unsafe) {
    return unsafe.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  item.cover = escapeHtml(`<picture>
    ${Object.values(cover)
      .map(
        (imageFormat) =>
          `<source type="${imageFormat[0].sourceType}" srcset="${imageFormat
            .map((entry) => entry.srcset)
            .join(", ")}">`,
      )
      .join("\n")}
      <img
        class="max-w-[200px] max-h-[300px]"
        src="${cover.jpeg[0].url}"
        alt="${item.cover_alt}"
        width="200"
        height="300"
        loading="lazy"
        decoding="async">
    </picture>`)

  item.cover = item.cover.replace(/(\r\n|\n|\r)/gm, "")

  item.started_on = new Date(item.started_on)
  if (item.ended_on) {
    item.ended_on = new Date(item.ended_on)
  }

  // NOTE: This is a special exception needed for books as we need to display different infos depending on the format even though they're technically the same type. Maybe there's a better way to do this, I don't know
  if (item.type === CatalogueType.BOOK) {
    item.formatType = item.volumes ? "multiple" : "single"
  }

  return item
}

function getCatalogueTypeFromURL(path: string): CatalogueType {
  return basename(dirname(path)).slice(0, -1) as CatalogueType
}

function getCatalogueURL(item: CatalogueItem): URL {
  return new URL(`/catalogue/${item.type}s/${item.slug}`, getBaseSiteURL())
}

export { postProcessCatalogueItem, CatalogueItem, CatalogueType }
