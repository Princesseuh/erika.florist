import { getSlugFromFile } from "$utils"
import type { FetchContentResultBase } from "astro"

// Trying to import this type in a .astro file creates a weird error so we re-export it from here
export type { Page } from "astro"

interface BaseObject extends FetchContentResultBase {
  [propName: string]: unknown
  loadCSSModules?: string[]
  socialImage: boolean

  // Astro stuff
  file: URL
}

// This post process the results of Astro.fetchContent with some values we use for everything (notably, slugs)
function postProcessBase(fetchedObject: BaseObject): BaseObject {
  fetchedObject.slug = getSlugFromFile(fetchedObject.file.pathname)
  fetchedObject.loadCSSModules = fetchedObject.loadCSSModules || []

  return fetchedObject
}

export { BaseObject, postProcessBase }
