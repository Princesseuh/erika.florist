import { basename, extname } from 'path'
import { fdir } from "fdir";
import * as matter from 'gray-matter';

interface Article extends matter.GrayMatterFile<string> {
    slug: string,
    link: URL,
    data: {
        title: string,
        tagline?: string,
        date: Date,
        dateString: string,
        tags: string[]
    }
}

// Astro has a thing to fetch Markdown content but I couldn't get it to work inside this file, it only worked in components
// Additionally, Astro supports just using .md files as pages however, you then need to specify the layout to use in every file which is very non-elegant
// and also, you have very little control over how the markdown files are parsed whereas, in this case, I have all the control I want really

// However, we end up rendering our markdown using Astro's Markdown component (which goes through Remark/Rehype and its plugins), so we get to have
// the cake and eat it too. In the future, if Astro's markdown support is a bit less restrictive, we could go their way fully instead of this half-half solution
const articles: Article[] = (() => {
    const files = new fdir()
        .withFullPaths()
        .filter((path) => path.endsWith('.md'))
        .crawl('./content/articles')
        .sync() as string[];

    const result = []
    files.forEach(file => {
        var markdownData = matter.read(file) as Article
        const slug = basename(file, extname(file))
        const link = new URL(`/articles/${slug}`, 'http://localhost:3000/')

        // Provide a string representation of the date of the article for easier usage
        const dateString = markdownData.data.date.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' })
        markdownData.data.dateString = dateString

        result.push({slug, link, ...markdownData})
    });

    // Sort articles by date. It's fine to do it here as it's the only way we'll ever sort them really
    result.sort((a: Article, b: Article) => {
        return b.data.date.valueOf() - a.data.date.valueOf()
    })

    return result
})();

// Get a specific article by slug, simple enough
// In the future, this could allow us to embed a specific article data into another article through a component, neat
function getArticle(slug: string): Article {
    const result = articles.find((article: Article) => {
        return article.slug === slug
    })

    return result
}

// This is used to generate the pages through getStaticPaths in [slug].astro
function getStaticListArticles(): object {
    const result = []
    articles.forEach(article => {
        result.push({ params: { slug: article.slug } })
    });

    return result
}

export { Article, articles, getArticle, getStaticListArticles }
