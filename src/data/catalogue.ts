import * as matter from 'gray-matter';
import { fdir } from "fdir";
import { basename, extname } from 'path'

interface CatalogueItem extends matter.GrayMatterFile<string> {
    slug: string,
    link: URL,
    data: {
        title: string,
        genre: string
        started_on: Date,
        ended_on?: Date, // If we don't have an ended_on, it means it was done in a day (for movies, one shots etc)
        cover_alt: string // Used for alt attribute on the cover, a11y yay
    }
}

// Books are a wild beast, mangas and one shots follow much different formats than normal books does, same goes for light novels
interface CatalogueBookBase extends CatalogueItem {
    type: string,
    data: CatalogueItem['data'] & {
        author: string,
    }
}

// For normal books, the only special thing we want is the page count really
interface CatalogueBookSingle extends CatalogueBookBase {
    data: CatalogueBookBase['data'] & {
        pages: number,
        format: string // We only care about the format here because mangas are very rarely available in another format than physical
    }
}

// This is mainly used for mangas and light novels which get bundled into one entry (unlike traditional books)
interface CatalogueBookMultiple extends CatalogueBookBase {
    data: CatalogueBookBase['data'] & {
        chapters: number,
        volumes: number
    }
}

// I don't want to at the moment, but perhaps it'd be cool to make types for developers and platforms
interface CatalogueGame extends CatalogueItem {
    data: CatalogueItem['data'] & {
        developer: string,
        playtime: number,
        platform: string
    }
}

const games: CatalogueGame[] = (() => {
    const files = new fdir()
        .withFullPaths()
        .filter((path) => path.endsWith('.md'))
        .crawl('./content/catalogue/games')
        .sync() as string[]

    const result: CatalogueGame[] = []
    files.forEach(file => {
        const markdownData = matter.read(file) as CatalogueGame
        const slug = basename(file, extname(file))
        const link = new URL(`/catalogue/games/${slug}`, 'http://localhost:3000/')

        result.push({slug, link, ...markdownData})
    })
    return result
})();

// I'm not too sure about the types here.. It works, tsc/eslint doesn't complain and I get proper completion in VS Code but still, feels wrong
const books: Array<CatalogueBookSingle | CatalogueBookMultiple> = (() => {
    const files = new fdir()
        .withFullPaths()
        .filter((path) => path.endsWith('.md'))
        .crawl('./content/catalogue/books')
        .sync() as string[]

    const result: Array<CatalogueBookSingle | CatalogueBookMultiple> = []
    files.forEach(file => {
        const markdownData = matter.read(file) as CatalogueBookBase
        const slug = basename(file, extname(file))
        const link = new URL(`/catalogue/books/${slug}`, 'http://localhost:3000/')
        const type = (markdownData as CatalogueBookMultiple).data.volumes ? 'multiple' : 'single'

        console.log(type)

        result.push({ slug, link, type, ...markdownData } as CatalogueBookSingle | CatalogueBookMultiple)
    })
    return result
})();

export { games, books }
