import GithubSlugger from "github-slugger";
import { QuickScore } from "quick-score";
import { thumbHashToDataURL } from "thumbhash";

const VERSION = 6;
const catalogueCore = document.getElementById("catalogue-core");
const latestHash = catalogueCore?.getAttribute("data-latest") ?? "";

const dbOpenRequest = indexedDB.open("catalogue", VERSION);

const content = document.getElementById("catalogue-content") as HTMLDivElement;
const entriesCountElements = document.querySelectorAll("#catalogue-entry-count");

let db: IDBDatabase;
let allItems: CatalogueItemDB[] = [];
let currentPage = 0;
const pageSize = 32;
let isLoading = false;

let wasUpgraded = false;

dbOpenRequest.onerror = (event) => {
	console.error(
		"Failed to open database, resetting database..",
		(event.target as IDBOpenDBRequest).error,
	);

	const deleteRequest = indexedDB.deleteDatabase("catalogue");
	deleteRequest.onsuccess = () => {
		// Don't create a new request with the same variable name
		const newDbRequest = indexedDB.open("catalogue", VERSION);

		newDbRequest.onupgradeneeded = (event) => {
			db = (event.target as IDBOpenDBRequest).result;
			resetAndCreateDB();
		};
	};
	deleteRequest.onerror = (e) => {
		console.error("Failed to delete database", (e.target as IDBRequest).error);
		errorUI();
	};
};

dbOpenRequest.onsuccess = () => {
	db = dbOpenRequest.result;

	// Skip version check if database was just upgraded
	if (wasUpgraded) {
		wasUpgraded = false;
		return;
	}

	// Check if database has data before building UI
	const transaction = db.transaction("content", "readonly");
	const objectStore = transaction.objectStore("content");

	// Check if database is empty first
	// Check version and completion status
	const versionCheck = objectStore.get("version");
	versionCheck.onsuccess = () => {
		if (
			!versionCheck.result ||
			versionCheck.result.hash !== latestHash ||
			!versionCheck.result.complete
		) {
			clearAndSeedDatabase();
		} else {
			buildUI();
		}
	};
	versionCheck.onerror = () => {
		clearAndSeedDatabase();
	};
};

dbOpenRequest.onupgradeneeded = (event) => {
	db = (event.target as IDBOpenDBRequest).result;
	wasUpgraded = true; // Set flag to skip version check in onsuccess
	resetAndCreateDB();
};

function clearAndSeedDatabase() {
	const transaction = db.transaction("content", "readwrite");
	const objectStore = transaction.objectStore("content");

	const clearRequest = objectStore.clear();
	clearRequest.onsuccess = () => {
		seedDatabase();
	};
	clearRequest.onerror = (e) => {
		console.error("Failed to clear database", e);
	};
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

	objectStore.transaction.oncomplete = () => {
		seedDatabase();
	};
}

type CatalogueData = [number, CatalogueItem[]];

type CatalogueItem = [
	string, // cover
	string, // placeholder
	number, // type
	string, // title
	number, // rating
	string, // author
	number | null, // finished date
	number | null, // release year
	string, // review content (rendered HTML)
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

function numberToType(type: number): string {
	switch (type) {
		case 0:
			return "game";
		case 1:
			return "movie";
		case 2:
			return "show";
		case 3:
			return "book";
		default:
			throw new Error("Unknown type: " + type);
	}
}

const getRatingEmoji = (rating: number) => {
	switch (rating) {
		case 5:
			return "❤️";
		case 4:
			return "🥰";
		case 3:
			return "🙂";
		case 2:
			return "😐";
		case 1:
			return "😕";
		case 0:
			return "🙁";
		default:
			return "";
	}
};

const getRatingLabel = (rating: number) => {
	switch (rating) {
		case 5:
			return "Masterpiece";
		case 4:
			return "Loved";
		case 3:
			return "Liked";
		case 2:
			return "Okay";
		case 1:
			return "Disliked";
		case 0:
			return "Hated";
		default:
			return "";
	}
};

// Review modal
const reviewModal = document.getElementById("review-modal") as HTMLDivElement;
const reviewModalTitleLink = document.getElementById("review-modal-title-link") as HTMLAnchorElement;
const reviewModalCover = document.getElementById("review-modal-cover") as HTMLImageElement;
const reviewModalMeta = document.getElementById("review-modal-meta") as HTMLDivElement;
const reviewModalContent = document.getElementById("review-modal-content") as HTMLDivElement;
const closeReviewModal = document.getElementById("close-review-modal") as HTMLButtonElement;

function openReviewModal(item: CatalogueItemDB) {
	const titleText = item.releaseYear ? `${item.title} (${item.releaseYear})` : item.title;
	reviewModalTitleLink.textContent = titleText;
	reviewModalTitleLink.href = `/catalogue/?entry=${item.id}`;

	if (item.cover) {
		reviewModalCover.src = item.cover;
		reviewModalCover.alt = `${item.title} cover`;
		reviewModalCover.classList.remove("hidden");
	} else {
		reviewModalCover.classList.add("hidden");
	}

	const ratingLabel = `${getRatingEmoji(item.rating)} ${getRatingLabel(item.rating)}`;
	const dateLabel =
		item.date > 0
			? new Date(item.date).toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				})
			: null;

	const finishedVerb: Record<string, string> = {
		game: "Played on",
		movie: "Watched on",
		show: "Watched on",
		book: "Read on",
	};

	const firstLine = item.author
		? `A ${item.type} by ${item.author} · ${ratingLabel}`
		: `A ${item.type} · ${ratingLabel}`;
	const secondLine = dateLabel ? `${finishedVerb[item.type] ?? "Finished on"} ${dateLabel}` : null;

	reviewModalMeta.innerHTML = `<div>${firstLine}</div>${secondLine ? `<div>${secondLine}</div>` : ""}`;

	reviewModalContent.innerHTML = item.review || "<p><em>No review written yet.</em></p>";

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

closeReviewModal.addEventListener("click", closeReviewModalFn);
reviewModal.addEventListener("click", (e) => {
	if (e.target === reviewModal) closeReviewModalFn();
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && !reviewModal.classList.contains("hidden")) closeReviewModalFn();
});

async function seedDatabase() {
	let catalogueData: CatalogueData;
	try {
		// Fetch the content from the JSON file
		catalogueData = (await fetch("/catalogue/content.json").then((response) =>
			response.json(),
		)) as CatalogueData;
	} catch (error) {
		console.error("Failed to fetch catalogue content", error);
		errorUI();
		return;
	}

	const contentObjectStore = db.transaction("content", "readwrite").objectStore("content");
	const [version, data] = catalogueData;

	const versionRequest = contentObjectStore.add({
		id: "version",
		hash: version,
		timestamp: Date.now(),
		complete: false, // Mark as incomplete initially
	});

	versionRequest.onerror = (e) => {
		console.error("Failed to add version", (e.target as IDBRequest).error);
		errorUI();
		return;
	};

	const slugger = new GithubSlugger();

	data.forEach((item) => {
		const [cover, placeholder, type, title, rating, author, date, releaseYear, review] = item;

		const itemType = numberToType(type);
		const id = slugger.slug(title) + "-" + itemType;

		const addRequest = contentObjectStore.add({
			id,
			type: itemType,
			title,
			lower_case_title: title.toLowerCase(),
			rating,
			date: date ?? 0,
			placeholder: thumbHashToDataURL(
				new Uint8Array(
					atob(placeholder)
						.split("")
						.map((c) => c.charCodeAt(0)),
				),
			),
			cover,
			author,
			releaseYear: releaseYear ?? null,
			review: review ?? "",
		});

		addRequest.onerror = (e) => {
			console.error("Failed to add item", id, (e.target as IDBRequest).error);
			errorUI();
			return;
		};
	});

	contentObjectStore.transaction.oncomplete = () => {
		// Mark seeding as complete
		const updateTransaction = db.transaction("content", "readwrite");
		const updateObjectStore = updateTransaction.objectStore("content");

		const getVersionRequest = updateObjectStore.get("version");
		getVersionRequest.onsuccess = () => {
			const versionRecord = getVersionRequest.result;
			if (versionRecord) {
				versionRecord.complete = true;
				const updateRequest = updateObjectStore.put(versionRecord);
				updateRequest.onsuccess = () => {
					buildUI();
				};
				updateRequest.onerror = (e) => {
					console.error("Failed to mark seeding as complete", (e.target as IDBRequest).error);
					errorUI();
					return;
				};
			} else {
				console.error("Version record not found when trying to mark complete");
				errorUI();
				return;
			}
		};
		getVersionRequest.onerror = (e) => {
			console.error(
				"Failed to get version record for completion update",
				(e.target as IDBRequest).error,
			);
			errorUI();
			return;
		};
	};
}

function buildUI() {
	if (isLoading) return;
	isLoading = true;

	// Get values from all inputs (desktop and mobile), use the one with a value
	const getInputValue = (selectors: string[]) => {
		for (const selector of selectors) {
			const inputs = Array.from(document.querySelectorAll(selector)) as (
				| HTMLInputElement
				| HTMLSelectElement
			)[];
			for (const input of inputs) {
				if (input.value) return input.value;
			}
		}
		return "";
	};

	const getCheckboxValue = (selectors: string[]) => {
		for (const selector of selectors) {
			const checkboxes = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
			for (const cb of checkboxes) {
				if (cb.checked) return true;
			}
		}
		return false;
	};

	const filters = {
		search: getInputValue(["#mobile-catalogue-search", "#catalogue-search"]).toLowerCase(),
		type: getInputValue(["#mobile-catalogue-types", "#catalogue-types"]),
		rating: getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"])
			? Number(getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"]))
			: "",
		sort: getInputValue(["#mobile-catalogue-sort", "#catalogue-sort"]) || "date",
	};

	const contentObjectStore = db.transaction("content", "readonly").objectStore("content");

	let request: IDBRequest;

	const cursorDirection = getCheckboxValue(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"])
		? "next"
		: "prev";

	// Use appropriate index for sorting
	if (filters.sort === "date") {
		const index = contentObjectStore.index("date");
		request = index.openCursor(null, cursorDirection);
	} else if (filters.sort === "rating") {
		const index = contentObjectStore.index("rating_date");
		request = index.openCursor(null, cursorDirection);
	} else if (filters.sort === "alphabetical") {
		const index = contentObjectStore.index("lower_case_title");
		request = index.openCursor(null, cursorDirection);
	} else {
		const index = contentObjectStore.index("date");
		request = index.openCursor(null, cursorDirection);
	}

	let items: CatalogueItemDB[] = [];

	request.onsuccess = (event) => {
		const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

		if (cursor) {
			const item = cursor.value;

			// Apply filters
			const matchesType = filters.type === "" || item.type === filters.type;
			const matchesRating = filters.rating === "" || item.rating === filters.rating;

			if (matchesType && matchesRating) {
				items.push(item);
			}

			cursor.continue();
		} else {
			// Apply search filter
			if (filters.search) {
				const qs = new QuickScore(items, {
					keys: ["title", "author"],
					minimumScore: 0.2,
					sortKey: "title",
				});
				const results = qs.search(filters.search);
				items = results.map((result) => result.item);
			}

			// Store filtered items for pagination
			allItems = items;
			currentPage = 0;

			// Clear content and render first page
			content.innerHTML = "";
			renderPage();
			updateEntryCount();

			// Open entry from URL param if present
			const entryParam = new URLSearchParams(window.location.search).get("entry");
			if (entryParam) {
				const transaction = db.transaction("content", "readonly");
				const req = transaction.objectStore("content").get(entryParam);
				req.onsuccess = () => {
					if (req.result && req.result.id !== "version") openReviewModal(req.result as CatalogueItemDB);
				};
			}

			isLoading = false;
			handleScroll(); // If the page is already scrolled down, render more items
		}
	};
}

function renderPage() {
	const startIndex = currentPage * pageSize;
	const endIndex = startIndex + pageSize;
	const pageItems = allItems.slice(startIndex, endIndex);

	if (pageItems.length === 0) {
		// No more items to render
		isLoading = false;
		content.innerHTML =
			'<p class="w-full text-center my-6">Nothing found. <a href="mailto:contact@erika.florist">Want to recommend me something?</a> </p>';
		return;
	}

	// Create a document fragment for better performance
	const fragment = document.createDocumentFragment();

	pageItems.forEach((item) => {
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
		entry.querySelector("button")!.addEventListener("click", () => openReviewModal(item));
		fragment.appendChild(entry);
	});

	content.appendChild(fragment);
	currentPage++;
}

function updateEntryCount() {
	for (const el of Array.from(entriesCountElements)) {
		el.textContent = `${allItems.length} entries`;
	}
}

function hasMorePages() {
	return currentPage * pageSize < allItems.length;
}

// Infinite scroll implementation
function handleScroll() {
	if (isLoading || !hasMorePages()) return;

	const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
	const windowHeight = window.innerHeight;
	const documentHeight = document.documentElement.scrollHeight;

	// Trigger when user is 200px from bottom
	if (scrollTop + windowHeight >= documentHeight - 250) {
		renderPage();
	}
}

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
	window.scrollTo({ top: 0, behavior: "instant" });
	currentPage = 0;
	allItems = [];
	buildUI();
}

function errorUI() {
	content.innerHTML =
		'<p class="w-full text-center my-6">Failed to load catalogue. If this happens even after refreshing the page, please contact me at <a href="mailto:contact@erika.florist">contact@erika.florist</a>.</p>';
	isLoading = false;
}

// Add event listeners to all filter inputs (both desktop and mobile)
const addListener = (selectors: string[], type: "input" | "change", handler: () => void) => {
	for (const selector of selectors) {
		Array.from(document.querySelectorAll(selector)).forEach((el) => {
			if (type === "input") {
				(el as HTMLInputElement).addEventListener("input", handler);
			} else {
				(el as HTMLSelectElement).addEventListener("change", handler);
			}
		});
	}
};

addListener(["#mobile-catalogue-search", "#catalogue-search"], "input", resetAndBuildUI);
addListener(["#mobile-catalogue-ratings", "#catalogue-ratings"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-sort", "#catalogue-sort"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-types", "#catalogue-types"], "change", resetAndBuildUI);
addListener(["#mobile-catalogue-sort-ord", "#catalogue-sort-ord"], "change", resetAndBuildUI);
