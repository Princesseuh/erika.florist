import type { CatalogueType } from "$data/catalogue"
import { QuickScore } from "quick-score"

interface CatalogueJSONItem {
  url: URL
  title: string
  cover: URL
  cover_alt: string
  type: CatalogueType
  creator: string
}

let fullElements: CatalogueJSONItem[] = []

let currentPage = 0
const elementPerPage = 30
let maxPage = Math.floor(fullElements.length / elementPerPage)

const pageUpButtons = document.querySelectorAll(".cataloguePageUp") as NodeListOf<HTMLButtonElement>
const pageDownButtons = document.querySelectorAll(
  ".cataloguePageDown",
) as NodeListOf<HTMLButtonElement>

pageUpButtons.forEach((button) => (button.onclick = () => pageUp()))
pageDownButtons.forEach((button) => (button.onclick = () => pageDown()))

const catalogueContent = document.getElementById("catalogueContent")
const resultCount = document.querySelectorAll(".catalogueCount") as NodeListOf<HTMLSpanElement>

// Filters
const filters = document.querySelectorAll(".filter") as NodeListOf<
  HTMLInputElement | HTMLSelectElement
>
const search = document.getElementById("search-input") as HTMLInputElement
const typeFilter = document.getElementById("type-select") as HTMLSelectElement
updateFiltersFromURL()

filters.forEach((filter) => {
  filter.addEventListener(filter.type === "text" ? "input" : "change", () =>
    updateFilters(true, true),
  )
})

function buildLibrary(subset: CatalogueJSONItem[] = fullElements) {
  const contentFragment = new DocumentFragment()

  const offset = currentPage * elementPerPage
  const maxElements =
    offset + elementPerPage > subset.length ? subset.length : offset + elementPerPage
  const pageSubset = subset.slice(offset, maxElements)

  pageSubset.forEach((item) => {
    const itemContainer = document.createElement("div")
    itemContainer.className = "w-[200px]"
    itemContainer.innerHTML = `
            <a href="${item.url}" class="hover:no-underline">
                ${item.cover}
                <span class="block">${item.title}</span>
                <span class="test-sm text-creative-work">${item.creator}</span>
            </a>
        `
    contentFragment.appendChild(itemContainer)
  })

  resultCount.forEach(
    (count) =>
      (count.innerText = `${Math.min(offset + 1, maxElements)} - ${maxElements} of ${
        subset.length
      } element${subset.length > 0 ? "s" : ""}`),
  )
  catalogueContent.replaceChildren(contentFragment)
}

function updateFilters(build = true, resetPage = false) {
  class LibraryBuilder {
    private library: CatalogueJSONItem[]
    private url: URL = new URL(window.location.href.split("?")[0])
    constructor(library: CatalogueJSONItem[]) {
      this.library = library
    }

    get result() {
      return {
        library: this.library,
        url: new URL(this.url),
      }
    }

    public search() {
      if (search.value === "") {
        return this
      }

      const qs = new QuickScore(this.library, ["title", "author"])
      const result = qs.search(search.value)

      const library = []
      result.forEach((hit) => {
        library.push(hit.item)
      })

      this.library = library
      return this
    }

    public filterByType() {
      if (typeFilter.selectedIndex === 0) {
        return this
      }

      this.url.searchParams.append("type", typeFilter.value)
      this.library = this.library.filter((value) => value.type === typeFilter.value)
      return this
    }

    public appendCurrentPage() {
      if (currentPage > 0) {
        this.url.searchParams.set("page", currentPage.toString())
      }
      return this
    }
  }

  if (resetPage) {
    currentPage = 0
  }

  const library = new LibraryBuilder(fullElements)
    .filterByType()
    .search()
    .appendCurrentPage().result

  maxPage = Math.floor(library.library.length / elementPerPage)
  if (library.library.length % elementPerPage === 0) {
    maxPage--
  }

  if (currentPage > maxPage) {
    currentPage = maxPage
    const newURL = library.url
    newURL.searchParams.set("page", currentPage.toString())
    window.history.replaceState(null, "", newURL)
  }

  if (currentPage < 0) {
    currentPage = 0
    const newURL = library.url
    newURL.searchParams.delete("page")
    window.history.replaceState(null, "", newURL)
  }

  updatePageButtonStatus()

  if (build) {
    window.history.replaceState(null, "", library.url)
    buildLibrary(library.library)
  }

  return library
}

function updateFiltersFromURL() {
  const queryString = window.location.search
  const urlParams = new URLSearchParams(queryString)

  if (urlParams.has("type")) {
    typeFilter.value = urlParams.get("type")
  }

  if (urlParams.has("page")) {
    currentPage = parseInt(urlParams.get("page"))

    if (isNaN(currentPage)) {
      currentPage = 0
      const newURL = new URL(document.location.href)
      newURL.searchParams.delete("page")
      window.history.replaceState(null, "", newURL)
    }
  }
}

function pageUp() {
  if (currentPage < maxPage) {
    currentPage += 1
  }

  updatePageButtonStatus()
  updateFilters()
}

function pageDown() {
  if (currentPage > 0) {
    currentPage -= 1
  }

  updatePageButtonStatus()
  updateFilters()
}

function updatePageButtonStatus() {
  pageUpButtons.forEach((button) => (button.disabled = currentPage === Math.max(maxPage, 0)))
  pageDownButtons.forEach((button) => (button.disabled = currentPage === 0))
}

// Astro currently doesn't support generating .json using Astro.fetchContent, so we need to generate a .html which imply
// That we need to get our json from the page's body, unfortunate
;(function initCatalogue() {
  fetch("/catalogue/content.json/")
    .then((response) => response.text())
    .then((data) => {
      const parser = new DOMParser()
      data = parser.parseFromString(data, "text/html").getElementsByTagName("body")[0].textContent
      fullElements = JSON.parse(data)
      buildLibrary(updateFilters(false).library)
    })
})()
