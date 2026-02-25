import GithubSlugger from "github-slugger";
import { QuickScore } from "quick-score";
import { thumbHashToDataURL } from "thumbhash";

const VERSION = 6;

function requireElement<T extends Element>(selector: string): T {
	const el = document.querySelector<T>(selector);
	if (el === null) {
		throw new Error(`Required element not found: ${selector}`);
	}
	return el;
}

const catalogueCore = requireElement<HTMLElement>("#catalogue-core");
const latestHash = catalogueCore.dataset.latest ?? "";

const dbOpenRequest = indexedDB.open("catalogue", VERSION);

const content = requireElement<Element>("#catalogue-content");
const entriesCountElements = document.querySelectorAll("#catalogue-entry-count");

let db: IDBDatabase;
let allItems: CatalogueItemDB[] = [];
let currentPage = 0;
const pageSize = 32;
let isLoading = false;

let wasUpgraded = false;

type CatalogueData = [string, CatalogueItem[]];

type CatalogueItem = [
	// cover
	string,
	// placeholder
	string,
	// type
	number,
	// title
	string,
	// rating
	number,
	// author
	string,
	// finished date
	number | null,
	// release year
	number | null,
	// review content (rendered HTML)
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
}

interface VersionRecord {
	id: "version";
	hash: string;
	timestamp: number;
	complete: boolean;
}

function typedResult<T>(request: IDBRequest<T>): T {
	return request.result;
}

function isCatalogueItem(value: unknown): value is CatalogueItemDB {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		(value as { id: unknown }).id !== "version"
	);
}

function isCatalogueItemDB(value: unknown): value is CatalogueItemDB {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		(value as { id: unknown }).id !== "version"
	);
}

function isCatalogueData(value: unknown): value is CatalogueData {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "string" &&
		Array.isArray(value[1])
	);
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

function readFilters(): { search: string; type: string; rating: number | ""; sort: string } {
	const ratingRaw = getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"]);
	return {
		rating: ratingRaw === "" ? "" : Number(ratingRaw),
		search: getInputValue(["#mobile-catalogue-search", "#catalogue-search"]).toLowerCase(),
		sort: getInputValue(["#mobile-catalogue-sort", "#catalogue-sort"]) || "date",
		type: getInputValue(["#mobile-catalogue-types", "#catalogue-types"]),
	};
}

function openCursorForSort(
	store: IDBObjectStore,
	sort: string,
	direction: IDBCursorDirection,
): IDBRequest<IDBCursorWithValue | null> {
	if (sort === "rating") {
		return store.index("rating_date").openCursor(null, direction);
	}
	if (sort === "alphabetical") {
		return store.index("lower_case_title").openCursor(null, direction);
	}
	return store.index("date").openCursor(null, direction);
}

const reviewModal = requireElement<Element>("#review-modal");
const reviewModalTitleLink = requireElement<HTMLAnchorElement>("#review-modal-title-link");
const reviewModalCover = requireElement<HTMLImageElement>("#review-modal-cover");
const reviewModalMeta = requireElement<Element>("#review-modal-meta");
const reviewModalContent = requireElement<Element>("#review-modal-content");
const closeReviewModalBtn = requireElement<Element>("#close-review-modal");

function buildModalMeta(item: CatalogueItemDB): string {
	const ratingLabel = `${getRatingEmoji(item.rating)} ${getRatingLabel(item.rating)}`;
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

function buildEntryElement(item: CatalogueItemDB): HTMLDivElement {
	const entry = document.createElement("div");
	entry.className = "w-[180px]";
	entry.innerHTML = `
            <div class="relative group">
              <button type="button" class="block w-full text-left cursor-pointer">
                <img class="max-w-full h-auto aspect-[3/4.3] object-cover block"
                     width="180" height="270"
                     src="${item.cover}"
                     loading="lazy"
                     style="background-size: cover;background-image: url(${
												item.placeholder
											});image-rendering:auto;"
                     onload="this.removeAttribute('style');this.removeAttribute('onload');"
                     decoding="async"
                     alt="${item.title} cover" />
                <span class="absolute top-0 right-0 pr-[0.15rem] pl-[0.2rem] bg-black/5 rounded-bl-lg select-none">
                    ${getRatingEmoji(item.rating)}
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
            </div>
        `;
	const btn = entry.querySelector("button");
	if (btn !== null) {
		btn.addEventListener("click", () => {
			openReviewModal(item);
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

// Infinite scroll implementation
function handleScroll() {
	if (isLoading || !hasMorePages()) {
		return;
	}

	const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
	const windowHeight = window.innerHeight;
	const documentHeight = document.documentElement.scrollHeight;

	// Trigger when user is 200px from bottom
	if (scrollTop + windowHeight >= documentHeight - 250) {
		renderPage();
	}
}

function openEntryFromParam() {
	const entryParam = new URLSearchParams(window.location.search).get("entry");
	if (entryParam === null) {
		return;
	}

	const transaction = db.transaction("content", "readonly");
	const req: IDBRequest<unknown> = transaction.objectStore("content").get(entryParam);
	req.addEventListener("success", () => {
		const result = typedResult(req);
		if (isCatalogueItem(result)) {
			openReviewModal(result);
		}
	});
}

function handleCursorComplete(items: CatalogueItemDB[]) {
	allItems = items;
	currentPage = 0;
	content.innerHTML = "";
	renderPage();
	updateEntryCount();
	openEntryFromParam();
	isLoading = false;
	// If the page is already scrolled down, render more items
	handleScroll();
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
	if (isLoading) {
		return;
	}
	isLoading = true;

	const filters = readFilters();
	const contentObjectStore = db.transaction("content", "readonly").objectStore("content");
	const cursorDirection = getCheckboxValue(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"])
		? "next"
		: "prev";
	const request = openCursorForSort(contentObjectStore, filters.sort, cursorDirection);

	const items: CatalogueItemDB[] = [];

	request.addEventListener("success", () => {
		const cursor = typedResult(request);

		if (cursor === null) {
			handleCursorComplete(applySearchFilter(items, filters.search));
		} else {
			const rawValue: unknown = cursor.value;
			if (isCatalogueItemDB(rawValue)) {
				const matchesType = filters.type === "" || rawValue.type === filters.type;
				const matchesRating = filters.rating === "" || rawValue.rating === filters.rating;

				if (matchesType && matchesRating) {
					items.push(rawValue);
				}
			}

			cursor.continue();
		}
	});
}

function seedItems(store: IDBObjectStore, data: CatalogueItem[]): void {
	const slugger = new GithubSlugger();

	for (const item of data) {
		const [cover, placeholder, type, title, rating, author, date, releaseYear, review] = item;

		const itemType = numberToType(type);
		const id = `${slugger.slug(title)}-${itemType}`;

		const addRequest: IDBRequest<IDBValidKey> = store.add({
			author,
			cover,
			date: date ?? 0,
			id,
			lower_case_title: title.toLowerCase(),
			placeholder: thumbHashToDataURL(
				Uint8Array.from(atob(placeholder), (c) => c.codePointAt(0) ?? 0),
			),
			rating,
			releaseYear: releaseYear ?? null,
			review: review ?? "",
			title,
			type: itemType,
		});

		addRequest.addEventListener("error", (e) => {
			const { target } = e;
			const err = target instanceof IDBRequest ? target.error : null;
			console.error("Failed to add item", id, err);
			errorUI();
		});
	}
}

function markSeedingComplete(updateStore: IDBObjectStore): void {
	const getVersionRequest: IDBRequest<unknown> = updateStore.get("version");
	getVersionRequest.addEventListener("success", () => {
		const raw: unknown = typedResult(getVersionRequest);
		if (
			typeof raw !== "object" ||
			raw === null ||
			!("complete" in raw) ||
			!("hash" in raw) ||
			!("id" in raw) ||
			!("timestamp" in raw)
		) {
			console.error("Version record not found when trying to mark complete");
			errorUI();
			return;
		}
		const rawWithFields = raw;
		if (typeof rawWithFields.hash !== "string" || typeof rawWithFields.timestamp !== "number") {
			console.error("Version record has invalid field types");
			errorUI();
			return;
		}
		const versionRecord: VersionRecord = {
			complete: true,
			hash: rawWithFields.hash,
			id: "version",
			timestamp: rawWithFields.timestamp,
		};
		const updateRequest: IDBRequest<IDBValidKey> = updateStore.put(versionRecord);
		updateRequest.addEventListener("success", () => {
			buildUI();
		});
		updateRequest.addEventListener("error", (e) => {
			const { target } = e;
			const err = target instanceof IDBRequest ? target.error : null;
			console.error("Failed to mark seeding as complete", err);
			errorUI();
		});
	});
	getVersionRequest.addEventListener("error", (e) => {
		const { target } = e;
		const err = target instanceof IDBRequest ? target.error : null;
		console.error("Failed to get version record for completion update", err);
		errorUI();
	});
}

async function fetchCatalogueData(): Promise<CatalogueData> {
	const response = await fetch("/catalogue/content.json");
	const json: unknown = await response.json();
	if (!isCatalogueData(json)) {
		throw new Error("Invalid catalogue data format");
	}
	return json;
}

async function seedDatabase() {
	let catalogueData: CatalogueData;
	try {
		catalogueData = await fetchCatalogueData();
	} catch (error) {
		console.error("Failed to fetch catalogue content", error);
		errorUI();
		return;
	}

	const contentObjectStore = db.transaction("content", "readwrite").objectStore("content");
	const [version, data] = catalogueData;

	const versionRequest: IDBRequest<IDBValidKey> = contentObjectStore.add({
		complete: false,
		hash: version,
		id: "version",
		timestamp: Date.now(),
	});

	versionRequest.addEventListener("error", (e) => {
		const { target } = e;
		const err = target instanceof IDBRequest ? target.error : null;
		console.error("Failed to add version", err);
		errorUI();
	});

	seedItems(contentObjectStore, data);

	contentObjectStore.transaction.addEventListener("complete", () => {
		const updateTransaction = db.transaction("content", "readwrite");
		markSeedingComplete(updateTransaction.objectStore("content"));
	});
}

function resetAndCreateDB() {
	// Only delete/create object stores during upgrade transactions
	if (db.objectStoreNames.contains("content")) {
		db.deleteObjectStore("content");
	}

	const objectStore = db.createObjectStore("content", {
		keyPath: "id",
	});

	objectStore.createIndex("date", "date", { unique: false });
	objectStore.createIndex("lower_case_title", "lower_case_title", {
		unique: false,
	});
	objectStore.createIndex("rating_date", ["rating", "date"], { unique: false });

	objectStore.transaction.addEventListener("complete", async () => {
		try {
			await seedDatabase();
		} catch (error) {
			errorUI();
			console.error(error);
		}
	});
}

function clearAndSeedDatabase() {
	const transaction = db.transaction("content", "readwrite");
	const objectStore = transaction.objectStore("content");

	const clearRequest = objectStore.clear();
	clearRequest.addEventListener("success", async () => {
		try {
			await seedDatabase();
		} catch (error) {
			errorUI();
			console.error(error);
		}
	});
	clearRequest.addEventListener("error", (e) => {
		console.error("Failed to clear database", e);
	});
}

dbOpenRequest.addEventListener("error", () => {
	console.error("Failed to open database, resetting database..", dbOpenRequest.error);

	const deleteRequest = indexedDB.deleteDatabase("catalogue");
	deleteRequest.addEventListener("success", () => {
		// Don't create a new request with the same variable name
		const newDbRequest = indexedDB.open("catalogue", VERSION);

		newDbRequest.addEventListener("upgradeneeded", () => {
			db = newDbRequest.result;
			resetAndCreateDB();
		});
	});
	deleteRequest.addEventListener("error", () => {
		console.error("Failed to delete database", deleteRequest.error);
		errorUI();
	});
});

dbOpenRequest.addEventListener("success", () => {
	db = dbOpenRequest.result;

	// Skip version check if database was just upgraded
	if (wasUpgraded) {
		wasUpgraded = false;
		return;
	}

	// Check if database has data before building UI
	const transaction = db.transaction("content", "readonly");
	const objectStore = transaction.objectStore("content");

	// Check version and completion status
	const versionCheck: IDBRequest<unknown> = objectStore.get("version");
	versionCheck.addEventListener("success", () => {
		const raw: unknown = typedResult(versionCheck);
		if (typeof raw !== "object" || raw === null || !("complete" in raw) || !("hash" in raw)) {
			clearAndSeedDatabase();
			return;
		}
		const { hash, complete } = raw;
		if (
			typeof hash !== "string" ||
			typeof complete !== "boolean" ||
			hash !== latestHash ||
			!complete
		) {
			clearAndSeedDatabase();
		} else {
			buildUI();
		}
	});
	versionCheck.addEventListener("error", () => {
		clearAndSeedDatabase();
	});
});

dbOpenRequest.addEventListener("upgradeneeded", () => {
	db = dbOpenRequest.result;
	// Set flag to skip version check in onsuccess
	wasUpgraded = true;
	resetAndCreateDB();
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

// Reset pagination when filters change
function resetAndBuildUI() {
	window.scrollTo({ behavior: "instant", top: 0 });
	currentPage = 0;
	allItems = [];
	buildUI();
}

// Sync paired controls (mobile + desktop) so getInputValue always reads a consistent value
function syncPairedInputs(selectors: string[], type: "input" | "change") {
	const elements = selectors.flatMap((s) => [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(s)]);
	for (const el of elements) {
		el.addEventListener(type, () => {
			for (const other of elements) {
				if (other === el) {continue;}
				if (el instanceof HTMLInputElement && el.type === "checkbox" && other instanceof HTMLInputElement && other.type === "checkbox") {
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

// Add event listeners to all filter inputs (both desktop and mobile)
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
