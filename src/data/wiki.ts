import * as matter from 'gray-matter';
import { fdir } from "fdir";
import { basename, extname } from 'path'
import { getCategory } from './wikiCategories'
import type { WikiCategory } from './wikiCategories'

interface WikiItem extends matter.GrayMatterFile<string> {
    slug: string,
    link: URL,
    file,
    category?: WikiCategory,
    data: {
        title: string,
        tagline?: string,
        navigation: {
            label?: string,
            category: string,
            order?: number,
            hidden?: boolean
        }
    }
}

const wikiItems: WikiItem[] = (() => {
    const files = new fdir()
        .withFullPaths()
        .filter((path) => path.endsWith('.md'))
        .crawl('./src/content/wiki')
        .sync() as string[]

    const result = []
    files.forEach(file => {
        const markdownData = matter.read(file) as WikiItem

        // Everything has a category, this is only useful for dev purpose
        if (markdownData.data.navigation == undefined) return

        // If we don't have an order, we set it to 0 which won't affect the sort
        markdownData.data.navigation.order = markdownData.data.navigation.order ?? 0

        const category = getCategory(markdownData.data.navigation.category)
        const slug = basename(file, extname(file))
        const link = new URL(`/wiki/${markdownData.data.navigation.category}/${slug}`, 'http://localhost:3000/')

        result.push({slug, link, file, category, ...markdownData})
    })
    return result
})();

function getWikiItem(slug: string): WikiItem {
    return wikiItems.find((wikiItem: WikiItem) => {
        return wikiItem.slug === slug
    })
}

function getWikiItemsByCategory(key: string): WikiItem[] {
    return wikiItems.filter((wikiItem: WikiItem) => {
        return wikiItem.data.navigation.category === key && !wikiItem.data.navigation.hidden
    }).sort((a: WikiItem, b: WikiItem) => {
        return a.data.navigation.order - b.data.navigation.order
    })
}

function getStaticListWikiItems(): Record<string, unknown>[]{
    const result = []
    wikiItems.forEach((wikiItem: WikiItem) => {
        result.push({ params: { category: wikiItem.data.navigation.category, slug: wikiItem.slug }})
    });

    return result
}

export { WikiItem, wikiItems, getWikiItem, getWikiItemsByCategory, getStaticListWikiItems }
