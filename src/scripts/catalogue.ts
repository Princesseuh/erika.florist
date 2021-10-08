import type { CatalogueType } from "../data/catalogue"

interface CatalogueJSONItem {
  title: string
  cover: URL
  cover_alt: string
  type: CatalogueType
  link: URL
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
            <a href="${item.link}" class="hover:no-underline">
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

;(function initCatalogue() {
  fetch("/catalogue.json")
    .then((response) => response.json())
    .then((data) => {
      fullElements = data
      buildLibrary()
    })
})()
