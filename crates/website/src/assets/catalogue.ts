import { QuickScore } from "quick-score";
import { thumbHashToDataURL } from "thumbhash";

import { type CatalogueRecord, type CollectionRef, loadCatalogueCache } from "./catalogue-db";

function requireElement<T extends Element>(selector: string): T {
	const el = document.querySelector<T>(selector);
	if (el === null) {
		throw new Error(`Required element not found: ${selector}`);
	}
	return el;
}

const catalogueCore = requireElement<HTMLElement>("#catalogue-core");
const latestHash = catalogueCore.dataset.latest ?? "";

// When present, restrict the grid to a collection's members (IDB ids). The main
// catalogue leaves this unset and shows everything.
const collectionIds =
	catalogueCore.dataset.collection === undefined || catalogueCore.dataset.collection === ""
		? null
		: new Set(catalogueCore.dataset.collection.split(","));

const content = requireElement<Element>("#catalogue-content");
const entriesCountElements = document.querySelectorAll("#catalogue-entry-count");

// Full dataset held in memory; IndexedDB is a read-once cache, not queried per interaction.
let allRecords: CatalogueRecord[] = [];
let allItems: CatalogueRecord[] = [];
let currentPage = 0;
const pageSize = 32;
let isLoading = false;

function typeToServerType(
	type: "game" | "movie" | "show" | "book",
): "game" | "movie" | "tv" | "book" {
	return type === "show" ? "tv" : type;
}

// The IDB id is `${diskSlug}-${type}`; strip the trailing `-${type}` to recover
// the on-disk slug. Safe even when the slug itself ends in a type word, since
// the appended type is always the last segment.
function slugFromId(id: string, type: "game" | "movie" | "show" | "book"): string {
	const suffix = `-${type}`;
	return id.endsWith(suffix) ? id.slice(0, -suffix.length) : id;
}

const getRatingEmoji = (rating: number) => {
	switch (rating) {
		case 5: {
			return "❤️";
		}
		case 4: {
			return "🥰";
		}
		case 3: {
			return "🙂";
		}
		case 2: {
			return "😐";
		}
		case 1: {
			return "😕";
		}
		case 0: {
			return "🙁";
		}
		default: {
			return "";
		}
	}
};

const getRatingLabel = (rating: number) => {
	switch (rating) {
		case 5: {
			return "Masterpiece";
		}
		case 4: {
			return "Loved";
		}
		case 3: {
			return "Liked";
		}
		case 2: {
			return "Okay";
		}
		case 1: {
			return "Disliked";
		}
		case 0: {
			return "Hated";
		}
		default: {
			return "";
		}
	}
};

function errorUI() {
	content.innerHTML =
		'<p class="w-full text-center my-6">Failed to load catalogue. If this happens even after refreshing the page, please contact me at <a href="mailto:contact@erika.florist">contact@erika.florist</a>.</p>';
	isLoading = false;
}

function getInputValue(selectors: string[]): string {
	for (const selector of selectors) {
		const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector);
		for (const input of inputs) {
			if (input.value !== "") {
				return input.value;
			}
		}
	}
	return "";
}

function getCheckboxValue(selectors: string[]): boolean {
	for (const selector of selectors) {
		const checkboxes = document.querySelectorAll<HTMLInputElement>(selector);
		for (const cb of checkboxes) {
			if (cb.checked) {
				return true;
			}
		}
	}
	return false;
}

function parseDate(value: string): number | null {
	if (value === "") {
		return null;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

function readFilters(): {
	search: string;
	type: string;
	rating: number | "";
	sort: string;
	status: string;
	dateFrom: number | null;
	dateTo: number | null;
} {
	const ratingRaw = getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"]);
	const statusRaw = getInputValue(["#mobile-catalogue-status", "#catalogue-status"]);
	const from = parseDate(getInputValue(["#mobile-catalogue-date-from", "#catalogue-date-from"]));
	const to = parseDate(getInputValue(["#mobile-catalogue-date-to", "#catalogue-date-to"]));
	return {
		rating: ratingRaw === "" ? "" : Number(ratingRaw),
		search: getInputValue(["#mobile-catalogue-search", "#catalogue-search"]).toLowerCase(),
		sort: getInputValue(["#mobile-catalogue-sort", "#catalogue-sort"]) || "date",
		status: statusRaw === "" ? "finished" : statusRaw,
		type: getInputValue(["#mobile-catalogue-types", "#catalogue-types"]),
		dateFrom: from,
		dateTo: to === null ? null : to + 86_400_000 - 1,
	};
}

// rating and release tie-break by date; `ascending` flips the whole ordering.
function sortItems(items: CatalogueRecord[], sort: string, ascending: boolean): CatalogueRecord[] {
	const direction = ascending ? 1 : -1;
	return [...items].sort((a, b) => {
		let ordering: number;
		if (sort === "rating") {
			ordering = a.rating - b.rating || a.date - b.date;
		} else if (sort === "release") {
			ordering = (a.releaseYear ?? 0) - (b.releaseYear ?? 0) || a.date - b.date;
		} else if (sort === "alphabetical") {
			ordering = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
		} else {
			ordering = a.date - b.date;
		}
		return ordering * direction;
	});
}

const reviewModal = requireElement<Element>("#review-modal");
const reviewModalTitleLink = requireElement<HTMLAnchorElement>("#review-modal-title-link");
const reviewModalCover = requireElement<HTMLImageElement>("#review-modal-cover");
const reviewModalMeta = requireElement<Element>("#review-modal-meta");
const reviewModalCollections = requireElement<HTMLElement>("#review-modal-collections");
const reviewModalContent = requireElement<Element>("#review-modal-content");
const reviewModalPromote = requireElement<HTMLButtonElement>("#review-modal-promote");

// `${type}/${diskSlug}` -> collections containing the entry.
let collectionsIndex: Record<string, CollectionRef[]> = {};

function renderModalCollections(item: CatalogueRecord, index: Record<string, CollectionRef[]>) {
	const key = `${item.type}/${slugFromId(item.id, item.type)}`;
	const collections = index[key] ?? [];
	reviewModalCollections.innerHTML = "";
	if (collections.length === 0) {
		return;
	}
	const label = document.createElement("span");
	label.className = "text-subtle-charcoal";
	label.textContent = "In collections:";
	reviewModalCollections.append(label);
	for (const collection of collections) {
		const link = document.createElement("a");
		link.href = `/catalogue/collections/${collection.slug}/`;
		link.className = "underline decoration-dotted underline-offset-2 hover:text-accent-valencia";
		link.textContent = collection.title;
		reviewModalCollections.append(link);
	}
}
const closeReviewModalBtn = requireElement<Element>("#close-review-modal");

function buildModalMeta(item: CatalogueRecord): string {
	const ratingLabel =
		item.status === "planned"
			? "🕒 Planned"
			: `${getRatingEmoji(item.rating)} ${getRatingLabel(item.rating)}`;
	const dateLabel =
		item.date > 0
			? new Date(item.date).toLocaleDateString("en-US", {
					day: "numeric",
					month: "long",
					year: "numeric",
				})
			: null;

	const finishedVerb: Record<string, string> = {
		book: "Read on",
		game: "Played on",
		movie: "Watched on",
		show: "Watched on",
	};

	const firstLine =
		item.author === ""
			? `A ${item.type} · ${ratingLabel}`
			: `A ${item.type} by ${item.author} · ${ratingLabel}`;
	const genresLine = item.genres.length === 0 ? null : item.genres.join(" · ");
	const runtimeLine = item.runtime === null ? null : `${formatRuntime(item.runtime)} runtime`;
	const dateLine =
		dateLabel === null ? null : `${finishedVerb[item.type] ?? "Finished on"} ${dateLabel}`;

	return [firstLine, genresLine, runtimeLine, dateLine]
		.filter((line): line is string => line !== null)
		.map((line) => `<div>${line}</div>`)
		.join("");
}

function formatRuntime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return hours === 0 ? `${mins}m` : `${hours}h ${mins}m`;
}

function updateModalCover(item: CatalogueRecord) {
	if (item.cover === "") {
		reviewModalCover.classList.add("hidden");
	} else {
		reviewModalCover.src = item.cover;
		reviewModalCover.alt = `${item.title} cover`;
		reviewModalCover.classList.remove("hidden");
	}
}

function requestPromote(item: CatalogueRecord) {
	document.dispatchEvent(
		new CustomEvent("catalogue:promote-request", {
			detail: {
				cover: item.cover,
				slug: slugFromId(item.id, item.type),
				title: item.title,
				type: typeToServerType(item.type),
			},
		}),
	);
}

let modalPromoteHandler: (() => void) | null = null;

function openReviewModal(item: CatalogueRecord) {
	const titleText = item.releaseYear === null ? item.title : `${item.title} (${item.releaseYear})`;
	reviewModalTitleLink.textContent = titleText;
	reviewModalTitleLink.href = `/catalogue/?entry=${item.id}`;
	updateModalCover(item);
	reviewModalMeta.innerHTML = buildModalMeta(item);
	renderModalCollections(item, collectionsIndex);
	reviewModalContent.innerHTML =
		item.review === "" ? "<p><em>No review written yet.</em></p>" : item.review;

	// The hover promote button on the card is unreachable on touch devices, so
	// planned entries also get a promote button inside the modal.
	if (modalPromoteHandler !== null) {
		reviewModalPromote.removeEventListener("click", modalPromoteHandler);
		modalPromoteHandler = null;
	}
	if (item.status === "planned") {
		modalPromoteHandler = () => {
			closeReviewModalFn();
			requestPromote(item);
		};
		reviewModalPromote.addEventListener("click", modalPromoteHandler);
		reviewModalPromote.classList.remove("hidden");
	} else {
		reviewModalPromote.classList.add("hidden");
	}

	reviewModal.classList.remove("hidden");
	document.body.style.overflow = "hidden";
}

function closeReviewModalFn() {
	reviewModal.classList.add("hidden");
	document.body.style.overflow = "";
	const url = new URL(window.location.href);
	if (url.searchParams.has("entry")) {
		url.searchParams.delete("entry");
		history.replaceState(null, "", url);
	}
}

closeReviewModalBtn.addEventListener("click", closeReviewModalFn);
reviewModal.addEventListener("click", (e) => {
	if (e.target === reviewModal) {
		closeReviewModalFn();
	}
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && !reviewModal.classList.contains("hidden")) {
		closeReviewModalFn();
	}
});

const placeholderCache = new Map<string, string>();
// Decode the thumbhash to a data URL lazily at render, only for shown cards: decoding all up front costs ~170ms on seed.
function placeholderDataUrl(base64: string): string {
	let url = placeholderCache.get(base64);
	if (url === undefined) {
		url = thumbHashToDataURL(Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0));
		placeholderCache.set(base64, url);
	}
	return url;
}

function buildEntryElement(item: CatalogueRecord): HTMLDivElement {
	const entry = document.createElement("div");
	entry.className = "w-[180px]";
	const isPlanned = item.status === "planned";
	const badge = isPlanned ? "🕒" : getRatingEmoji(item.rating);
	const dimClass = isPlanned ? "grayscale" : "";
	const scrim = isPlanned
		? `<div class="absolute inset-0 bg-white-sugar-cane/45 pointer-events-none"></div>`
		: "";
	entry.innerHTML = `
            <div class="relative group">
              <button type="button" class="block w-full text-left cursor-pointer">
                <img class="max-w-full h-auto aspect-[3/4.3] object-cover block ${dimClass}"
                     width="180" height="270"
                     src="${item.cover}"
                     loading="lazy"
                     style="background-size: cover;background-image: url(${placeholderDataUrl(item.placeholder)});image-rendering:auto;"
                     onload="this.removeAttribute('style');this.removeAttribute('onload');"
                     decoding="async"
                     alt="${item.title} cover" />
                ${scrim}
                <span class="absolute top-0 right-0 pr-[0.15rem] pl-[0.2rem] bg-black/5 rounded-bl-lg select-none">
                    ${badge}
                </span>
                <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <h4 class="m-0 leading-tight text-sm font-medium">
                        ${item.title}
                    </h4>
                    <p class="text-xs m-0">
                        ${item.author}
                    </p>
                </div>
              </button>
              ${
								isPlanned
									? `<button type="button" data-promote class="absolute top-1 left-1 bg-accent-valencia text-white text-xs font-bold rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer hover:bg-accent-valencia/80">Mark finished</button>`
									: ""
							}
            </div>
        `;
	const btn = entry.querySelector<HTMLButtonElement>("button:not([data-promote])");
	if (btn !== null) {
		btn.addEventListener("click", () => {
			openReviewModal(item);
		});
	}
	const promoteBtn = entry.querySelector<HTMLButtonElement>("button[data-promote]");
	if (promoteBtn !== null) {
		promoteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			requestPromote(item);
		});
	}
	return entry;
}

function renderPage() {
	const startIndex = currentPage * pageSize;
	const pageItems = allItems.slice(startIndex, startIndex + pageSize);

	if (pageItems.length === 0) {
		isLoading = false;
		content.innerHTML =
			'<p class="w-full text-center my-6">Nothing found. <a href="mailto:contact@erika.florist">Want to recommend me something?</a> </p>';
		return;
	}

	const fragment = document.createDocumentFragment();
	for (const item of pageItems) {
		fragment.append(buildEntryElement(item));
	}
	content.append(fragment);
	currentPage += 1;
}

function updateEntryCount() {
	for (const el of entriesCountElements) {
		el.textContent = `${allItems.length} entries`;
	}
}

function hasMorePages() {
	return currentPage * pageSize < allItems.length;
}

function handleScroll() {
	if (isLoading || !hasMorePages()) {
		return;
	}

	const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
	const windowHeight = window.innerHeight;
	const documentHeight = document.documentElement.scrollHeight;

	if (scrollTop + windowHeight >= documentHeight - 250) {
		renderPage();
	}
}

function openEntryFromParam() {
	const entryParam = new URLSearchParams(window.location.search).get("entry");
	if (entryParam === null) {
		return;
	}
	const item = allRecords.find((record) => record.id === entryParam);
	if (item !== undefined) {
		openReviewModal(item);
	}
}

function applySearchFilter(items: CatalogueRecord[], search: string): CatalogueRecord[] {
	if (search === "") {
		return items;
	}
	const qs = new QuickScore(items, {
		keys: ["title", "author"],
		minimumScore: 0.2,
		sortKey: "title",
	});
	return qs.search(search).map((result) => result.item);
}

function buildUI() {
	const filters = readFilters();
	const descendingToggle = getCheckboxValue(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"]);
	// Collections read best oldest-first, so their default direction is inverted
	// relative to the catalogue's newest-first default.
	const ascending = collectionIds === null ? descendingToggle : !descendingToggle;

	const dateActive = filters.dateFrom !== null || filters.dateTo !== null;
	const filtered = allRecords.filter(
		(item) =>
			(filters.type === "" || item.type === filters.type) &&
			(filters.rating === "" || item.rating === filters.rating) &&
			(filters.status === "all" || item.status === filters.status) &&
			(collectionIds === null || collectionIds.has(item.id)) &&
			(!dateActive ||
				(item.date > 0 &&
					(filters.dateFrom === null || item.date >= filters.dateFrom) &&
					(filters.dateTo === null || item.date <= filters.dateTo))),
	);

	allItems =
		filters.search === ""
			? sortItems(filtered, filters.sort, ascending)
			: applySearchFilter(filtered, filters.search);

	currentPage = 0;
	content.innerHTML = "";
	renderPage();
	updateEntryCount();
	openEntryFromParam();
	isLoading = false;
	// If the page is already scrolled down, render more items.
	handleScroll();
}

loadCatalogueCache(
	latestHash,
	({ records, collections }) => {
		allRecords = records;
		collectionsIndex = collections;
		buildUI();
	},
	errorUI,
);

let ticking = false;
document.addEventListener(
	"scroll",
	() => {
		if (!ticking) {
			window.requestAnimationFrame(() => {
				handleScroll();
				ticking = false;
			});

			ticking = true;
		}
	},
	{ passive: true },
);

function resetAndBuildUI() {
	window.scrollTo({ behavior: "instant", top: 0 });
	currentPage = 0;
	allItems = [];
	buildUI();
}

// Sync paired controls (mobile + desktop) so getInputValue always reads a consistent value
function syncPairedInputs(selectors: string[], type: "input" | "change") {
	const elements = selectors.flatMap((s) => [
		...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(s),
	]);
	for (const el of elements) {
		el.addEventListener(type, () => {
			for (const other of elements) {
				if (other === el) {
					continue;
				}
				if (
					el instanceof HTMLInputElement &&
					el.type === "checkbox" &&
					other instanceof HTMLInputElement &&
					other.type === "checkbox"
				) {
					other.checked = el.checked;
				} else {
					other.value = el.value;
				}
			}
		});
	}
}

syncPairedInputs(["#mobile-catalogue-search", "#catalogue-search"], "input");
syncPairedInputs(["#mobile-catalogue-ratings", "#catalogue-ratings"], "change");
syncPairedInputs(["#mobile-catalogue-sort", "#catalogue-sort"], "change");
syncPairedInputs(["#mobile-catalogue-types", "#catalogue-types"], "change");
syncPairedInputs(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"], "change");
syncPairedInputs(["#mobile-catalogue-status", "#catalogue-status"], "change");
syncPairedInputs(["#mobile-catalogue-date-from", "#catalogue-date-from"], "input");
syncPairedInputs(["#mobile-catalogue-date-to", "#catalogue-date-to"], "input");

const addListener = (selectors: string[], type: "input" | "change", handler: () => void) => {
	for (const selector of selectors) {
		for (const el of document.querySelectorAll(selector)) {
			el.addEventListener(type, handler);
		}
	}
};

addListener(["#mobile-catalogue-search", "#catalogue-search"], "input", resetAndBuildUI);
addListener(["#mobile-catalogue-ratings", "#catalogue-ratings"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-sort", "#catalogue-sort"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-types", "#catalogue-types"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-status", "#catalogue-status"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-date-from", "#catalogue-date-from"], "input", resetAndBuildUI);
addListener(["#mobile-catalogue-date-to", "#catalogue-date-to"], "input", resetAndBuildUI);
