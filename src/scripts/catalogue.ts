import type { CatalogueType } from "../data/catalogue"

interface CatalogueJSONItem {
  url: URL
  title: string
  cover: URL
  cover_alt: string
  type: CatalogueType
  creator: string
}

let fullElements: CatalogueJSONItem[] = []
const catalogueContent = document.getElementById("catalogueContent")
const resultCount = document.getElementById("catalogueCount")

function buildLibrary(subset: CatalogueJSONItem[] = fullElements) {
  const contentFragment = new DocumentFragment()

  subset.forEach((item) => {
    const itemContainer = document.createElement("div")
    itemContainer.className = "w-[200px]"
    itemContainer.innerHTML = `
            <a href="${item.url}" class="hover:no-underline">
                <img src="${item.cover}" alt="${item.cover_alt}" class="max-w-[200px] max-h-[300px]" width="300" height="300" loading="lazy" decoding="async"/>
                <span class="block">${item.title}</span>
                <span class="test-sm text-creative-work">${item.creator}</span>
            </a>
        `
    contentFragment.appendChild(itemContainer)
  })

  resultCount.innerText = `${subset.length} element${subset.length > 1 ? "s" : ""}`
  catalogueContent.replaceChildren(contentFragment)
}

// Astro currently doesn't support generating anything other than .html files
// So we need to get our json from the page's body
;(function initCatalogue() {
  fetch("/catalogue/content.json")
    .then((response) => response.text())
    .then((data) => {
      const parser = new DOMParser()
      data = parser.parseFromString(data, "text/html").getElementsByTagName("body")[0].innerText
      fullElements = JSON.parse(data)
      buildLibrary()
    })
})()
