import { getSlugFromFile } from '../utils'

interface BaseObject {
    [propName: string]: unknown;
    file: URL
    astro: Record<string, unknown>
    url: URL
}

// This post process the results of Astro.fetchContent with some values we use for everything (notably, slugs)
function postProcessBase(fetchedObject: BaseObject):BaseObject {
    fetchedObject.slug = getSlugFromFile(fetchedObject.file.pathname)

    return fetchedObject
}

export { BaseObject, postProcessBase }
