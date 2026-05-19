const API_URL =
	window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
		? "http://localhost:8787"
		: "https://api.erika.florist";

type EntryType = "game" | "movie" | "tv" | "book";
type EntryStatus = "finished" | "planned";
type Mode = "finished" | "planned" | "promote";

interface QueueItem {
	type: EntryType;
	name: string;
	source_id: string;
	status: EntryStatus;
	rating: string;
	date: string;
	comment: string;
	slug?: string;
}

function isEntryType(value: string): value is EntryType {
	return value === "game" || value === "movie" || value === "tv" || value === "book";
}

function isMode(value: string): value is Mode {
	return value === "finished" || value === "planned" || value === "promote";
}

function requireElement<T extends Element>(selector: string): T {
	const el = document.querySelector<T>(selector);
	if (el === null) {
		throw new Error(`Required element not found: ${selector}`);
	}
	return el;
}

function setHidden(el: Element, hidden: boolean) {
	el.classList.toggle("hidden", hidden);
}

let isAuthenticated = false;
let mode: Mode = "finished";
const queue: QueueItem[] = [];

const modal = requireElement<HTMLElement>("#add-entry-modal");
const openBtn = requireElement<HTMLButtonElement>("#add-entry-btn");
const closeBtn = requireElement<HTMLButtonElement>("#close-modal");
const modalTitle = requireElement<HTMLHeadingElement>("#add-modal-title");
const modeToggle = requireElement<HTMLElement>("#modal-mode-toggle");
const modeBtns = [...document.querySelectorAll<HTMLButtonElement>(".modal-mode-btn")];
const queueSection = requireElement<HTMLElement>("#queue-section");
const queueCount = requireElement<HTMLElement>("#queue-count");
const queueItemsEl = requireElement<HTMLUListElement>("#queue-items");

const form = requireElement<HTMLFormElement>("#add-entry-form");
const typeSelect = requireElement<HTMLSelectElement>("#entry-type");
const titleInput = requireElement<HTMLInputElement>("#entry-name");
const searchSpinner = requireElement<HTMLElement>("#entry-search-spinner");
const searchResults = requireElement<HTMLElement>("#search-results");
const sourceIdHidden = requireElement<HTMLInputElement>("#entry-source-id");
const sourceIdDisplay = requireElement<HTMLInputElement>("#entry-source-id-display");
const promoteSlugHidden = requireElement<HTMLInputElement>("#entry-promote-slug");
const selectedCover = requireElement<HTMLImageElement>("#selected-cover");
const selectedCoverPlaceholder = requireElement<HTMLElement>("#selected-cover-placeholder");
const selectedTitle = requireElement<HTMLElement>("#selected-title");
const ratingRow = requireElement<HTMLElement>("#rating-row");
const dateRow = requireElement<HTMLElement>("#date-row");
const commentRow = requireElement<HTMLElement>("#comment-row");
const dateInput = requireElement<HTMLInputElement>("#entry-date");
const commentInput = requireElement<HTMLTextAreaElement>("#entry-comment");
const typeTitleRow = requireElement<HTMLElement>("#type-title-row");
const skipCiCheckbox = requireElement<HTMLInputElement>("#skip-ci");
const passwordInput = requireElement<HTMLInputElement>("#form-password");
const errorDiv = requireElement<HTMLElement>("#form-error");
const submitBtn = requireElement<HTMLButtonElement>("#submit-btn");
const addToQueueBtn = requireElement<HTMLButtonElement>("#add-to-queue-btn");

function setError(message: string | null) {
	if (message === null) {
		setHidden(errorDiv, true);
		errorDiv.textContent = "";
	} else {
		errorDiv.textContent = message;
		setHidden(errorDiv, false);
	}
}

function showToast(message: string, commitUrl: string | null) {
	const toast = document.createElement("div");
	toast.className =
		"fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white-sugar-cane border-2 border-black rounded-lg px-4 py-3 shadow-lg text-black text-sm font-medium transition-opacity duration-500";
	if (commitUrl === null) {
		toast.textContent = message;
	} else {
		const a = document.createElement("a");
		a.href = commitUrl;
		a.target = "_blank";
		a.rel = "noopener";
		a.className = "underline font-bold hover:text-accent-valencia";
		a.textContent = "View commit";
		toast.append(`${message} `, a);
	}
	document.body.append(toast);
	setTimeout(() => {
		toast.style.opacity = "0";
		setTimeout(() => {
			toast.remove();
		}, 500);
	}, 6000);
}

function resetSelection() {
	titleInput.value = "";
	sourceIdHidden.value = "";
	sourceIdDisplay.value = "";
	selectedTitle.textContent = "No selection";
	setHidden(selectedCover, true);
	selectedCover.src = "";
	setHidden(selectedCoverPlaceholder, false);
	setHidden(searchResults, true);
	searchResults.innerHTML = "";
}

function resetFormFields() {
	resetSelection();
	const checked = document.querySelector<HTMLInputElement>('input[name="rating"]:checked');
	if (checked !== null) {
		checked.checked = false;
	}
	dateInput.value = "";
	commentInput.value = "";
}

function computeSubmitLabel(currentMode: Mode): string {
	if (currentMode === "promote") {
		return "Submit";
	}
	const total = queue.length + 1;
	return total > 1 ? `Submit (${total})` : "Submit";
}

function applyMode(next: Mode) {
	mode = next;

	for (const btn of modeBtns) {
		const matches = btn.dataset.mode === next;
		btn.classList.toggle("bg-white-sugar-cane", matches);
		btn.classList.toggle("bg-zinc-200", !matches);
	}

	const isPromote = next === "promote";
	const isPlanned = next === "planned";

	setHidden(modeToggle, isPromote);
	setHidden(ratingRow, isPlanned);
	setHidden(dateRow, isPlanned);
	setHidden(commentRow, isPlanned);
	setHidden(typeTitleRow, isPromote);
	setHidden(addToQueueBtn, isPromote);

	typeSelect.disabled = isPromote;
	titleInput.disabled = isPromote ? true : typeSelect.value === "";

	if (isPromote) {
		modalTitle.textContent = "Mark as finished";
	} else if (isPlanned) {
		modalTitle.textContent = "Add to plan";
	} else {
		modalTitle.textContent = "Add catalogue entry";
	}
	submitBtn.textContent = computeSubmitLabel(next);
}

function refreshQueueUI() {
	queueCount.textContent = String(queue.length);
	queueItemsEl.innerHTML = "";
	setHidden(queueSection, queue.length === 0);
	for (const [index, item] of queue.entries()) {
		const li = document.createElement("li");
		li.className = "flex items-center justify-between gap-2 bg-zinc-100 rounded px-2 py-1";
		const label = document.createElement("span");
		label.className = "truncate";
		const tag = item.status === "planned" ? "📌" : "✅";
		label.textContent = `${tag} ${item.name} (${item.type})`;
		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "text-red-700 font-bold text-lg leading-none px-1";
		removeBtn.textContent = "×";
		removeBtn.title = "Remove from queue";
		removeBtn.dataset.index = String(index);
		li.append(label, removeBtn);
		queueItemsEl.append(li);
	}
}

function openModal(initialMode: Mode = "finished") {
	if (!isAuthenticated) {
		return;
	}
	setHidden(modal, false);
	setError(null);
	applyMode(initialMode);
}

function closeModal() {
	setHidden(modal, true);
	setError(null);
	resetFormFields();
	queue.length = 0;
	promoteSlugHidden.value = "";
	refreshQueueUI();
	applyMode("finished");
	typeSelect.value = "";
	titleInput.disabled = true;
	titleInput.placeholder = "Select type first...";
}

interface SearchResult {
	id: string;
	name: string;
	cover: string | null;
}

function isGameSearchData(
	value: unknown,
): value is { id: number; name: string; cover?: { url?: string } }[] {
	return Array.isArray(value);
}

function isBookSearchData(value: unknown): value is {
	docs: { isbn?: string[]; key: string; title: string; cover_i?: number }[];
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"docs" in value &&
		Array.isArray((value as { docs: unknown }).docs)
	);
}

function isTmdbSearchData(value: unknown): value is {
	results: { id: number; title?: string; name?: string; poster_path?: string | null }[];
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"results" in value &&
		Array.isArray((value as { results: unknown }).results)
	);
}

function selectResult(result: SearchResult) {
	titleInput.value = result.name;
	sourceIdHidden.value = result.id;
	sourceIdDisplay.value = result.id;
	selectedTitle.textContent = result.name;
	if (result.cover === null) {
		setHidden(selectedCover, true);
		setHidden(selectedCoverPlaceholder, false);
	} else {
		const coverUrl = result.cover.startsWith("//") ? `https:${result.cover}` : result.cover;
		selectedCover.src = coverUrl;
		setHidden(selectedCover, false);
		setHidden(selectedCoverPlaceholder, true);
	}
	setHidden(searchResults, true);
}

function buildResultRow(r: SearchResult): HTMLDivElement {
	const div = document.createElement("div");
	div.className = "flex items-center gap-2 p-2 hover:bg-zinc-200 cursor-pointer text-black";
	if (r.cover === null) {
		const placeholder = document.createElement("div");
		placeholder.className = "w-8 h-12 bg-gray-300 flex-shrink-0";
		const span = document.createElement("span");
		span.className = "text-sm truncate";
		span.textContent = r.name;
		div.append(placeholder, span);
	} else {
		const img = document.createElement("img");
		const coverUrl = r.cover.startsWith("//") ? `https:${r.cover}` : r.cover;
		img.src = coverUrl;
		img.className = "w-8 h-12 object-cover flex-shrink-0";
		const span = document.createElement("span");
		span.className = "text-sm truncate";
		span.textContent = r.name;
		div.append(img, span);
	}
	div.addEventListener("click", () => {
		selectResult(r);
	});
	return div;
}

function displayResults(data: unknown, type: EntryType) {
	searchResults.innerHTML = "";
	setHidden(searchResults, false);

	let results: SearchResult[] = [];
	if (type === "game") {
		if (isGameSearchData(data)) {
			results = data.map((g) => ({
				cover: g.cover?.url ?? null,
				id: String(g.id),
				name: g.name,
			}));
		}
	} else if (type === "book") {
		if (isBookSearchData(data)) {
			results = data.docs.map((b) => ({
				cover:
					b.cover_i === undefined ? null : `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`,
				id: b.isbn?.[0] ?? b.key,
				name: b.title,
			}));
		}
	} else if (isTmdbSearchData(data)) {
		results = data.results.map((m) => ({
			cover:
				m.poster_path === undefined || m.poster_path === null
					? null
					: `https://image.tmdb.org/t/p/w92${m.poster_path}`,
			id: String(m.id),
			name: m.title ?? m.name ?? "",
		}));
	}

	for (const r of results) {
		searchResults.append(buildResultRow(r));
	}
}

async function search() {
	const query = titleInput.value;
	const typeValue = typeSelect.value;
	if (query === "" || typeValue === "" || !isEntryType(typeValue)) {
		return;
	}
	const type: EntryType = typeValue;

	const sourceMap: Record<EntryType, string> = {
		book: "isbn",
		game: "igdb",
		movie: "tmdb",
		tv: "tmdb",
	};
	const source = sourceMap[type];
	const tmdbType = type === "tv" ? "tv" : "movie";

	setHidden(searchSpinner, false);
	try {
		const url = `${API_URL}/search?source=${source}&query=${encodeURIComponent(query)}&type=${tmdbType}`;
		const response = await fetch(url, { credentials: "include" });
		const text = await response.text();
		const data: unknown = JSON.parse(text);
		displayResults(data, type);
	} catch (error) {
		console.error("Search failed:", error);
	} finally {
		setHidden(searchSpinner, true);
	}
}

function gatherCurrentItem(): QueueItem | null {
	const typeValue = typeSelect.value;
	const name = titleInput.value.trim();
	const sourceId = sourceIdDisplay.value === "" ? sourceIdHidden.value : sourceIdDisplay.value;
	const promoteSlug = promoteSlugHidden.value;

	if (mode !== "promote") {
		if (typeValue === "") {
			setError("Please select a type");
			return null;
		}
		if (name === "") {
			setError("Please pick a title");
			return null;
		}
		if (sourceId === "") {
			setError("Please select a search result, or paste a source ID");
			return null;
		}
	}

	let rating = "";
	let date = "";
	let comment = "";
	let status: EntryStatus;

	if (mode === "planned") {
		status = "planned";
	} else {
		status = "finished";
		const checked = document.querySelector<HTMLInputElement>('input[name="rating"]:checked');
		if (checked === null) {
			setError("Please select a rating");
			return null;
		}
		rating = checked.value;
		date = dateInput.value;
		comment = commentInput.value;
	}

	const effectiveType: EntryType = typeValue !== "" && isEntryType(typeValue) ? typeValue : "movie";
	const item: QueueItem = {
		comment,
		date,
		name,
		rating,
		source_id: sourceId,
		status,
		type: effectiveType,
	};
	if (promoteSlug !== "") {
		item.slug = promoteSlug;
	}
	return item;
}

interface BatchPayloadItem {
	type: EntryType;
	name: string;
	"source-id": string;
	status: EntryStatus;
	rating: string;
	date: string;
	comment: string;
	slug: string | null;
}

interface BatchPayload {
	"form-password": string;
	"skip-ci": boolean;
	items: BatchPayloadItem[];
}

function toPayloadItem(i: QueueItem): BatchPayloadItem {
	return {
		comment: i.comment,
		date: i.date,
		name: i.name,
		rating: i.rating,
		slug: i.slug ?? null,
		"source-id": i.source_id,
		status: i.status,
		type: i.type,
	};
}

async function submitAll() {
	const current = gatherCurrentItem();
	if (current === null) {
		return;
	}
	const items: QueueItem[] = [...queue, current];

	if (passwordInput.value === "") {
		setError("Password is required");
		return;
	}

	setError(null);
	submitBtn.disabled = true;
	addToQueueBtn.disabled = true;

	const payload: BatchPayload = {
		"form-password": passwordInput.value,
		items: items.map(toPayloadItem),
		"skip-ci": skipCiCheckbox.checked,
	};

	try {
		const response = await fetch(`${API_URL}/commit-batch`, {
			body: JSON.stringify(payload),
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		if (!response.ok) {
			const text = await response.text();
			let message = "Failed to submit";
			try {
				const data: unknown = JSON.parse(text);
				if (typeof data === "object" && data !== null && "message" in data) {
					message = String((data as { message: unknown }).message);
				}
			} catch {
				message = text === "" ? message : text;
			}
			setError(message);
			return;
		}

		const data: unknown = await response.json();
		let commitUrl: string | null = null;
		if (typeof data === "object" && data !== null && "commit_url" in data) {
			const value = (data as { commit_url: unknown }).commit_url;
			if (typeof value === "string" && value !== "") {
				commitUrl = value;
			}
		}
		let verb: string;
		if (mode === "promote") {
			verb = "Promoted!";
		} else if (items.length === 1) {
			verb = "Entry added!";
		} else {
			verb = `${items.length} entries added!`;
		}
		closeModal();
		showToast(verb, commitUrl);
	} catch (error) {
		console.error("Submit failed:", error);
		setError("An error occurred");
	} finally {
		submitBtn.disabled = false;
		addToQueueBtn.disabled = false;
	}
}

function addCurrentToQueue() {
	const current = gatherCurrentItem();
	if (current === null) {
		return;
	}
	queue.push(current);
	resetFormFields();
	typeSelect.value = "";
	titleInput.disabled = true;
	titleInput.placeholder = "Select type first...";
	refreshQueueUI();
	applyMode(mode);
}

async function checkAuth() {
	if (!document.cookie.split(";").some((c) => c.trim().startsWith("logged_in="))) {
		return;
	}
	try {
		const response = await fetch(`${API_URL}/auth`, { credentials: "include" });
		if (!response.ok) {
			return;
		}
		const data: unknown = await response.json();
		if (
			typeof data === "object" &&
			data !== null &&
			"authenticated" in data &&
			(data as { authenticated: unknown }).authenticated === true
		) {
			isAuthenticated = true;
			setHidden(openBtn, false);
			document.documentElement.dataset.catalogueAuthed = "true";
			document.dispatchEvent(new CustomEvent("catalogue-auth-ready"));
		}
	} catch (error) {
		console.error("Auth check failed:", error);
	}
}

interface PromoteRequestDetail {
	slug: string;
	type: EntryType;
	title: string;
	sourceId: string;
	cover: string;
}

declare global {
	interface DocumentEventMap {
		"catalogue:promote-request": CustomEvent<unknown>;
	}
}

function readString(value: object, key: string): string | null {
	if (!(key in value)) {
		return null;
	}
	const v: unknown = Reflect.get(value, key);
	return typeof v === "string" ? v : null;
}

function isPromoteRequestDetail(value: unknown): value is PromoteRequestDetail {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const slug = readString(value, "slug");
	const type = readString(value, "type");
	const title = readString(value, "title");
	const sourceId = readString(value, "sourceId");
	const cover = readString(value, "cover");
	return (
		slug !== null &&
		type !== null &&
		isEntryType(type) &&
		title !== null &&
		sourceId !== null &&
		cover !== null
	);
}

let searchDebounce: number | undefined;

queueItemsEl.addEventListener("click", (event) => {
	const { target } = event;
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}
	const indexStr = target.dataset.index;
	if (indexStr === undefined) {
		return;
	}
	const index = Number.parseInt(indexStr, 10);
	if (Number.isNaN(index)) {
		return;
	}
	queue.splice(index, 1);
	refreshQueueUI();
	applyMode(mode);
});

openBtn.addEventListener("click", () => {
	openModal("finished");
});
closeBtn.addEventListener("click", () => {
	closeModal();
});
modal.addEventListener("click", (e) => {
	if (e.target === modal) {
		closeModal();
	}
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && !modal.classList.contains("hidden")) {
		closeModal();
	}
});

for (const btn of modeBtns) {
	btn.addEventListener("click", () => {
		const next = btn.dataset.mode ?? "";
		if (isMode(next)) {
			applyMode(next);
		}
	});
}

typeSelect.addEventListener("change", () => {
	const hasType = typeSelect.value !== "";
	titleInput.disabled = !hasType;
	titleInput.placeholder = hasType ? "Search by title..." : "Select type first...";
});

titleInput.addEventListener("input", () => {
	window.clearTimeout(searchDebounce);
	searchDebounce = window.setTimeout(async () => {
		try {
			await search();
		} catch (error) {
			console.error(error);
		}
	}, 400);
});

addToQueueBtn.addEventListener("click", () => {
	addCurrentToQueue();
});

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	try {
		await submitAll();
	} catch (error) {
		console.error(error);
	}
});

document.addEventListener("catalogue:promote-request", (event) => {
	const { detail } = event;
	if (!isPromoteRequestDetail(detail)) {
		return;
	}
	if (!isAuthenticated) {
		return;
	}
	openModal("promote");
	typeSelect.value = detail.type;
	titleInput.value = detail.title;
	sourceIdHidden.value = detail.sourceId;
	sourceIdDisplay.value = detail.sourceId;
	promoteSlugHidden.value = detail.slug;
	selectedTitle.textContent = detail.title;
	if (detail.cover === "") {
		setHidden(selectedCover, true);
		setHidden(selectedCoverPlaceholder, false);
	} else {
		selectedCover.src = detail.cover;
		setHidden(selectedCover, false);
		setHidden(selectedCoverPlaceholder, true);
	}
});

document.addEventListener("DOMContentLoaded", async () => {
	try {
		await checkAuth();
	} catch (error) {
		console.error(error);
	}
});

// If DOMContentLoaded already fired (script ran late), trigger immediately.
if (document.readyState !== "loading") {
	document.dispatchEvent(new Event("DOMContentLoaded"));
}

export {};
