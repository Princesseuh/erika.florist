interface Article {
    slug: string
    title: string,
    tagline?: string,
    date: Date,
    dateString?: string,
    tags: string[]

    // Provided by Astro
    astro: Record<string, unknown>
    url: URL
}

export { Article }
