import { QuickScore } from "quick-score";
import { thumbHashToDataURL } from "thumbhash";

const VERSION = 9;

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

const dbOpenRequest = indexedDB.open("catalogue", VERSION);

const content = requireElement<Element>("#catalogue-content");
const entriesCountElements = document.querySelectorAll("#catalogue-entry-count");

let db: IDBDatabase;
// Full dataset held in memory; IndexedDB is a read-once cache, not queried per interaction.
let allRecords: CatalogueItemDB[] = [];
let allItems: CatalogueItemDB[] = [];
let currentPage = 0;
const pageSize = 32;
let isLoading = false;

type CatalogueData = [string, CatalogueItem[], Record<string, CollectionRef[]>];

type CatalogueItem = [
	// cover
	string,
	// placeholder
	string,
	// type
	number,
	// title
	string,
	// rating (null for planned items)
	number | null,
	// author
	string,
	// finished date
	number | null,
	// release year
	number | null,
	// review content (rendered HTML)
	string,
	// status (0 = finished, 1 = planned)
	number,
	// file slug on disk
	string,
];

interface CatalogueItemDB {
	id: string;
	cover: string;
	placeholder: string;
	type: "game" | "movie" | "show" | "book";
	title: string;
	rating: number;
	author: string;
	date: number;
	releaseYear: number | null;
	review: string;
	status: "finished" | "planned";
}

function typedResult<T>(request: IDBRequest<T>): T {
	return request.result;
}

function isCatalogueData(value: unknown): value is CatalogueData {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "string" &&
		Array.isArray(value[1])
	);
}

function numberToStatus(value: number): "finished" | "planned" {
	return value === 1 ? "planned" : "finished";
}

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

function numberToType(type: number): string {
	switch (type) {
		case 0: {
			return "game";
		}
		case 1: {
			return "movie";
		}
		case 2: {
			return "show";
		}
		case 3: {
			return "book";
		}
		default: {
			throw new Error(`Unknown type: ${type}`);
		}
	}
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

function readFilters(): {
	search: string;
	type: string;
	rating: number | "";
	sort: string;
	status: string;
} {
	const ratingRaw = getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"]);
	const statusRaw = getInputValue(["#mobile-catalogue-status", "#catalogue-status"]);
	return {
		rating: ratingRaw === "" ? "" : Number(ratingRaw),
		search: getInputValue(["#mobile-catalogue-search", "#catalogue-search"]).toLowerCase(),
		sort: getInputValue(["#mobile-catalogue-sort", "#catalogue-sort"]) || "date",
		status: statusRaw === "" ? "finished" : statusRaw,
		type: getInputValue(["#mobile-catalogue-types", "#catalogue-types"]),
	};
}

// rating and release tie-break by date; `ascending` flips the whole ordering.
function sortItems(items: CatalogueItemDB[], sort: string, ascending: boolean): CatalogueItemDB[] {
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

interface CollectionRef {
	slug: string;
	title: string;
}

// `${type}/${diskSlug}` -> collections containing the entry.
let collectionsIndex: Record<string, CollectionRef[]> = {};

function isCollectionsIndex(value: unknown): value is Record<string, CollectionRef[]> {
	return typeof value === "object" && value !== null;
}

function renderModalCollections(item: CatalogueItemDB, index: Record<string, CollectionRef[]>) {
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
		link.className =
			"underline decoration-dotted underline-offset-2 hover:text-accent-valencia";
		link.textContent = collection.title;
		reviewModalCollections.append(link);
	}
}
const closeReviewModalBtn = requireElement<Element>("#close-review-modal");

function buildModalMeta(item: CatalogueItemDB): string {
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
	const secondLine =
		dateLabel === null ? null : `${finishedVerb[item.type] ?? "Finished on"} ${dateLabel}`;

	return `<div>${firstLine}</div>${secondLine === null ? "" : `<div>${secondLine}</div>`}`;
}

function updateModalCover(item: CatalogueItemDB) {
	if (item.cover === "") {
		reviewModalCover.classList.add("hidden");
	} else {
		reviewModalCover.src = item.cover;
		reviewModalCover.alt = `${item.title} cover`;
		reviewModalCover.classList.remove("hidden");
	}
}

function openReviewModal(item: CatalogueItemDB) {
	const titleText = item.releaseYear === null ? item.title : `${item.title} (${item.releaseYear})`;
	reviewModalTitleLink.textContent = titleText;
	reviewModalTitleLink.href = `/catalogue/?entry=${item.id}`;
	updateModalCover(item);
	reviewModalMeta.innerHTML = buildModalMeta(item);
	renderModalCollections(item, collectionsIndex);
	reviewModalContent.innerHTML =
		item.review === "" ? "<p><em>No review written yet.</em></p>" : item.review;
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

function buildEntryElement(item: CatalogueItemDB): HTMLDivElement {
	const entry = document.createElement("div");
	entry.className = "w-[180px]";
	const isPlanned = item.status === "planned";
	const badge = isPlanned ? "🕒" : getRatingEmoji(item.rating);
	const dimClass = isPlanned ? "grayscale" : "";
	const scrim = isPlanned
		? `<div class="absolute inset-0 bg-white-sugar-cane/45 pointer-events-none"></div>`
		: "";
	const showPromote = isPlanned && document.documentElement.dataset.catalogueAuthed === "true";
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
								showPromote
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

function applySearchFilter(items: CatalogueItemDB[], search: string): CatalogueItemDB[] {
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

	const filtered = allRecords.filter(
		(item) =>
			(filters.type === "" || item.type === filters.type) &&
			(filters.rating === "" || item.rating === filters.rating) &&
			(filters.status === "all" || item.status === filters.status) &&
			(collectionIds === null || collectionIds.has(item.id)),
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

function toRecord(entry: CatalogueItem): CatalogueItemDB {
	const [cover, placeholder, typeNum, title, rating, author, date, releaseYear, review, statusNum, slug] =
		entry;
	const type = numberToType(typeNum) as CatalogueItemDB["type"];
	return {
		author,
		cover,
		date: date ?? 0,
		id: `${slug}-${type}`,
		placeholder,
		rating: rating ?? -1,
		releaseYear: releaseYear ?? null,
		review: review ?? "",
		status: numberToStatus(statusNum),
		title,
		type,
	};
}

async function fetchCatalogueData(): Promise<CatalogueData> {
	const response = await fetch("/catalogue/content.json");
	const json: unknown = await response.json();
	if (!isCatalogueData(json)) {
		throw new Error("Invalid catalogue data format");
	}
	return json;
}

// One atomic transaction: an abort commits nothing, so the cache is never left marked-complete but half-seeded.
function seedCache(hash: string, records: CatalogueItemDB[], collections: Record<string, CollectionRef[]>) {
	const tx = db.transaction(["content", "meta"], "readwrite");
	const contentStore = tx.objectStore("content");
	const metaStore = tx.objectStore("meta");
	contentStore.clear();
	for (const record of records) {
		contentStore.put(record);
	}
	metaStore.put({ data: collections, id: "collections" });
	metaStore.put({ complete: true, hash, id: "version", timestamp: Date.now() });
	tx.addEventListener("error", () => {
		console.error("Failed to seed catalogue cache", tx.error);
	});
}

async function fetchAndSeed() {
	let data: CatalogueData;
	try {
		data = await fetchCatalogueData();
	} catch (error) {
		console.error("Failed to fetch catalogue content", error);
		errorUI();
		return;
	}
	const [hash, entries, collections] = data;
	allRecords = entries.map(toRecord);
	collectionsIndex = collections ?? {};
	// Render straight from memory; seeding the cache is background work for next visit.
	buildUI();
	seedCache(hash, allRecords, collectionsIndex);
}

function loadFromCache() {
	const tx = db.transaction(["content", "meta"], "readonly");
	const itemsRequest = tx.objectStore("content").getAll() as IDBRequest<CatalogueItemDB[]>;
	const collectionsRequest: IDBRequest<unknown> = tx.objectStore("meta").get("collections");
	tx.addEventListener("complete", () => {
		allRecords = itemsRequest.result;
		const raw: unknown = collectionsRequest.result;
		collectionsIndex =
			typeof raw === "object" &&
			raw !== null &&
			"data" in raw &&
			isCollectionsIndex((raw as { data: unknown }).data)
				? (raw as { data: Record<string, CollectionRef[]> }).data
				: {};
		buildUI();
	});
	tx.addEventListener("error", () => {
		console.error("Failed to read catalogue cache, refetching", tx.error);
		void fetchAndSeed();
	});
}

function resetSchema() {
	for (const name of Array.from(db.objectStoreNames)) {
		db.deleteObjectStore(name);
	}
	db.createObjectStore("content", { keyPath: "id" });
	db.createObjectStore("meta", { keyPath: "id" });
}

dbOpenRequest.addEventListener("error", () => {
	console.error("Failed to open database, resetting database..", dbOpenRequest.error);

	const deleteRequest = indexedDB.deleteDatabase("catalogue");
	deleteRequest.addEventListener("success", () => {
		const retry = indexedDB.open("catalogue", VERSION);
		retry.addEventListener("upgradeneeded", () => {
			db = retry.result;
			resetSchema();
		});
		retry.addEventListener("success", () => {
			db = retry.result;
			void fetchAndSeed();
		});
	});
	deleteRequest.addEventListener("error", () => {
		console.error("Failed to delete database", deleteRequest.error);
		errorUI();
	});
});

dbOpenRequest.addEventListener("success", () => {
	db = dbOpenRequest.result;

	const versionRequest: IDBRequest<unknown> = db
		.transaction("meta", "readonly")
		.objectStore("meta")
		.get("version");
	versionRequest.addEventListener("success", () => {
		const raw: unknown = typedResult(versionRequest);
		const fresh =
			typeof raw === "object" &&
			raw !== null &&
			"hash" in raw &&
			"complete" in raw &&
			(raw as { hash: unknown }).hash === latestHash &&
			(raw as { complete: unknown }).complete === true;
		if (fresh) {
			loadFromCache();
		} else {
			void fetchAndSeed();
		}
	});
	versionRequest.addEventListener("error", () => {
		void fetchAndSeed();
	});
});

dbOpenRequest.addEventListener("upgradeneeded", () => {
	db = dbOpenRequest.result;
	resetSchema();
});

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
