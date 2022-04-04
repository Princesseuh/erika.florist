import type { BaseFrontmatter } from "./shared"
import { basename, dirname } from "path"
import { getBaseSiteURL, getSlugFromFile } from "$utils"
import { generateImage, generatePlaceholder, ImageFormat } from "astro-eleventy-img"

enum CatalogueType {
  GAME = "game",
  BOOK = "book",
  MOVIE = "movie",
  SHOW = "show",
}

interface CatalogueItemBase extends BaseFrontmatter {
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
  studio: string
  length: number
}

interface CatalogueShow extends CatalogueItemBase {
  studio: string
  seasons: number
  episodes: number
  platform: string
}

type CatalogueItem =
  | CatalogueGame
  | CatalogueMovie
  | CatalogueShow
  | CatalogueBookSingle
  | CatalogueBookMultiple

const isBook = (item: CatalogueItem): item is CatalogueBookMultiple | CatalogueBookSingle => {
  return item.type === CatalogueType.BOOK
}

async function postProcessCatalogueItem(item: CatalogueItem, file: string): Promise<CatalogueItem> {
  item.slug = getSlugFromFile(file)
  item.type = getCatalogueTypeFromURL(file)

  const itemBaseDir = `/catalogue/${item.type}s/${item.slug}/`
  item.url = new URL(itemBaseDir, getBaseSiteURL())

  const cover: Record<string, Array<ImageFormat>> = generateImage(
    "content/assets" + itemBaseDir.slice(0, -1) + `.jpg`,
    {
      outputDir: "static/assets/images",
      widths: [300],
      formats: ["avif", "webp", "jpeg"],
    },
  )

  const placeholder = await generatePlaceholder(
    "content/assets" + itemBaseDir.slice(0, -1) + `.jpg`,
  )

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
        class="max-w-[200px] max-h-[300px] ${
          // If our image is super small, it's probably because it's a square, notably this happens with older games
          // In which case, we'll add a background and try to fit the image in our rectangle
          cover.jpeg[0].height < 300 ? "object-contain bg-fin-lanka bg-opacity-50" : ""
        }"
        src="${cover.jpeg[0].url}"
        alt="${item.cover_alt}"
        width="200"
        height="300"
        loading="lazy"
        decoding="async"
        style="background-size: cover;background-image:url(${placeholder?.dataURI})"
        onload="this.style.backgroundImage='none'">
    </picture>`)

  item.cover = item.cover.replace(/(\r\n|\n|\r)/gm, "")

  item.started_on = new Date(item.started_on)
  if (item.ended_on) {
    item.ended_on = new Date(item.ended_on)
  }

  // NOTE: This is a special exception needed for books as we need to display different infos depending on the format even though they're technically the same type. Maybe there's a better way to do this, I don't know
  if (isBook(item)) {
    item.formatType = (item as CatalogueBookMultiple).volumes ? "multiple" : "single"
  }

  return item
}

function getCatalogueTypeFromURL(path: string): CatalogueType {
  return basename(dirname(path)).slice(0, -1) as CatalogueType
}

export { postProcessCatalogueItem, CatalogueItem, CatalogueType }
