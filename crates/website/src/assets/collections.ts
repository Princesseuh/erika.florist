const API_URL =
	window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
		? "http://localhost:8787"
		: "https://api.erika.florist";

type MemberType = "game" | "movie" | "tv" | "book";

function isMemberType(value: string): value is MemberType {
	return value === "game" || value === "movie" || value === "tv" || value === "book";
}

function setHidden(el: Element, hidden: boolean) {
	el.classList.toggle("hidden", hidden);
}

function byId<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (el === null) {
		throw new Error(`Missing #${id}`);
	}
	return el as T;
}

/* ------------------------------------------------------------------ *
 * Filter + sort engine (shared by the list and detail pages)
 * ------------------------------------------------------------------ */

interface FilterSpec {
	prefixes: [string, string]; // [desktop, mobile]
	cardSelector: string;
	containerId: string;
	countId: string;
	countNoun: string;
	hasTypeStatusRating: boolean;
	completion: boolean;
	dateRange: boolean;
	sortKeys: Record<string, (card: HTMLElement) => number | string>;
	defaultSort: string;
}

function parseDate(value: string): number | null {
	if (value === "") {
		return null;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

function readControl(id: string): string {
	const el = document.getElementById(id);
	if (el instanceof HTMLInputElement) {
		return el.type === "checkbox" ? (el.checked ? "1" : "") : el.value;
	}
	if (el instanceof HTMLSelectElement) {
		return el.value;
	}
	return "";
}

function firstValue(prefixes: [string, string], key: string): string {
	for (const prefix of prefixes) {
		const value = readControl(`${prefix}-${key}`);
		if (value !== "") {
			return value;
		}
	}
	return "";
}

function applyFilters(spec: FilterSpec) {
	const container = document.getElementById(spec.containerId);
	if (container === null) {
		return;
	}
	const search = firstValue(spec.prefixes, "search").toLowerCase().trim();
	const type = spec.hasTypeStatusRating ? firstValue(spec.prefixes, "types") : "";
	const status = spec.hasTypeStatusRating ? firstValue(spec.prefixes, "status") : "";
	const rating = spec.hasTypeStatusRating ? firstValue(spec.prefixes, "ratings") : "";
	const completion = spec.completion ? firstValue(spec.prefixes, "completion") : "";
	const dateFrom = spec.dateRange ? parseDate(firstValue(spec.prefixes, "date-from")) : null;
	const dateToRaw = spec.dateRange ? parseDate(firstValue(spec.prefixes, "date-to")) : null;
	const dateTo = dateToRaw === null ? null : dateToRaw + 86_400_000 - 1;
	const dateActive = dateFrom !== null || dateTo !== null;
	const sortRaw = firstValue(spec.prefixes, "sort");
	const sort = sortRaw === "" ? spec.defaultSort : sortRaw;
	const descending = firstValue(spec.prefixes, "sort-ord") !== "1";

	const cards = [...container.querySelectorAll<HTMLElement>(spec.cardSelector)];
	let visible = 0;
	for (const card of cards) {
		let show = true;
		if (search !== "" && !(card.dataset.search ?? "").includes(search)) {
			show = false;
		}
		if (type !== "" && card.dataset.type !== type) {
			show = false;
		}
		if (status !== "" && status !== "all" && card.dataset.status !== status) {
			show = false;
		}
		if (rating !== "") {
			const cardRating = card.dataset.rating;
			if (cardRating === undefined || cardRating === "" || Number(cardRating) < Number(rating)) {
				show = false;
			}
		}
		if (completion === "completed" && card.dataset.completed !== "true") {
			show = false;
		}
		if (completion === "progress" && card.dataset.completed !== "false") {
			show = false;
		}
		if (dateActive) {
			const activity = Number(card.dataset.activity ?? "0");
			if (
				activity <= 0 ||
				(dateFrom !== null && activity < dateFrom) ||
				(dateTo !== null && activity > dateTo)
			) {
				show = false;
			}
		}
		card.classList.toggle("hidden", !show);
		if (show) {
			visible += 1;
		}
	}

	const keyFn = spec.sortKeys[sort] ?? spec.sortKeys[spec.defaultSort];
	if (keyFn !== undefined) {
		const sorted = [...cards].sort((a, b) => {
			const av = keyFn(a);
			const bv = keyFn(b);
			let cmp: number;
			if (typeof av === "string" || typeof bv === "string") {
				cmp = String(av).localeCompare(String(bv));
			} else {
				cmp = av - bv;
			}
			return descending ? -cmp : cmp;
		});
		for (const card of sorted) {
			container.append(card);
		}
	}

	// The count element is rendered in both the desktop and mobile sidebars
	// (same id twice), so update every match, not just the first.
	const noun = visible === 1 ? spec.countNoun : `${spec.countNoun}s`;
	for (const countEl of document.querySelectorAll(`#${spec.countId}`)) {
		countEl.textContent = `${visible} ${noun}`;
	}
}

function wireFilters(spec: FilterSpec) {
	const keys = spec.hasTypeStatusRating
		? ["search", "types", "status", "ratings", "sort", "sort-ord"]
		: ["search", "sort", "sort-ord"];
	if (spec.completion) {
		keys.push("completion");
	}
	if (spec.dateRange) {
		keys.push("date-from", "date-to");
	}
	const run = () => {
		applyFilters(spec);
	};
	for (const prefix of spec.prefixes) {
		for (const key of keys) {
			const el = document.getElementById(`${prefix}-${key}`);
			if (el === null) {
				continue;
			}
			const event =
				el instanceof HTMLInputElement && (el.type === "search" || el.type === "date")
					? "input"
					: "change";
			el.addEventListener(event, () => {
				// Mirror to the sibling (desktop <-> mobile) so both stay in sync.
				const other = spec.prefixes.find((p) => p !== prefix);
				if (other !== undefined) {
					const sibling = document.getElementById(`${other}-${key}`);
					if (sibling instanceof HTMLInputElement && el instanceof HTMLInputElement) {
						if (el.type === "checkbox") {
							sibling.checked = el.checked;
						} else {
							sibling.value = el.value;
						}
					} else if (sibling instanceof HTMLSelectElement && el instanceof HTMLSelectElement) {
						sibling.value = el.value;
					}
				}
				run();
			});
		}
	}
	run();
}

function num(card: HTMLElement, key: string): number {
	return Number(card.dataset[key] ?? "0");
}

function initFilters() {
	if (document.getElementById("collections-content") !== null) {
		wireFilters({
			prefixes: ["collections", "mobile-collections"],
			cardSelector: "[data-collection-card]",
			containerId: "collections-content",
			countId: "collections-entry-count",
			countNoun: "collection",
			hasTypeStatusRating: false,
			completion: true,
			dateRange: true,
			defaultSort: "activity",
			sortKeys: {
				activity: (card) => num(card, "activity"),
				alphabetical: (card) => card.dataset.title ?? "",
			},
		});
	}
}

/* ------------------------------------------------------------------ *
 * Create-collection modal (list page only, when authenticated)
 * ------------------------------------------------------------------ */

interface Member {
	kind: "existing" | "new";
	type: MemberType;
	name: string;
	slug?: string;
	sourceId?: string;
}

interface LocalEntry {
	type: MemberType;
	slug: string;
	title: string;
	cover: string;
}

interface SearchHit {
	label: string;
	cover: string | null;
	member: Member;
}

function normalizeCover(url: string): string {
	return url.startsWith("//") ? `https:${url}` : url;
}

const TYPE_ID_TO_TYPE: Record<number, MemberType> = { 0: "game", 1: "movie", 2: "tv", 3: "book" };
const TYPE_TO_SOURCE: Record<MemberType, string> = {
	book: "isbn",
	game: "igdb",
	movie: "tmdb",
	tv: "tmdb",
};

let rawEntries: unknown[] | null = null;

async function fetchEntries(): Promise<unknown[]> {
	if (rawEntries !== null) {
		return rawEntries;
	}
	try {
		const response = await fetch("/catalogue/content.json");
		const data: unknown = await response.json();
		rawEntries = Array.isArray(data) && Array.isArray(data[1]) ? (data[1] as unknown[]) : [];
	} catch (error) {
		console.error("Failed to load catalogue:", error);
		rawEntries = [];
	}
	return rawEntries;
}

let localCatalogue: LocalEntry[] | null = null;

async function loadLocalCatalogue(): Promise<LocalEntry[]> {
	if (localCatalogue !== null) {
		return localCatalogue;
	}
	const list: LocalEntry[] = [];
	for (const entry of await fetchEntries()) {
		if (!Array.isArray(entry)) {
			continue;
		}
		const cover = entry[0];
		const typeId = entry[2];
		const title = entry[3];
		const slug = entry[10];
		if (typeof typeId === "number" && typeof title === "string" && typeof slug === "string") {
			const type = TYPE_ID_TO_TYPE[typeId];
			if (type !== undefined) {
				list.push({ cover: typeof cover === "string" ? cover : "", slug, title, type });
			}
		}
	}
	localCatalogue = list;
	return list;
}

function searchExisting(entries: LocalEntry[], type: MemberType, query: string): SearchHit[] {
	const q = query.toLowerCase();
	return entries
		.filter((e) => e.type === type && e.title.toLowerCase().includes(q))
		.slice(0, 6)
		.map((e) => ({
			label: `${e.title} · in catalogue`,
			cover: e.cover === "" ? null : e.cover,
			member: { kind: "existing", name: e.title, slug: e.slug, type },
		}));
}

interface RawHit {
	id: string;
	name: string;
	cover: string | null;
}

function parseNewResults(data: unknown, type: MemberType): RawHit[] {
	if (type === "game" && Array.isArray(data)) {
		return data
			.filter(
				(g): g is { id: number; name: string; cover?: { url?: string } } =>
					typeof g === "object" && g !== null,
			)
			.map((g) => ({
				id: String(g.id),
				name: g.name,
				cover: g.cover?.url ? normalizeCover(g.cover.url) : null,
			}));
	}
	if (type === "book" && typeof data === "object" && data !== null && "docs" in data) {
		const docs = (data as { docs: unknown }).docs;
		if (Array.isArray(docs)) {
			return docs
				.filter(
					(b): b is { isbn?: string[]; key: string; title: string; cover_i?: number } =>
						typeof b === "object" && b !== null,
				)
				.map((b) => ({
					id: b.isbn?.[0] ?? b.key,
					name: b.title,
					cover:
						b.cover_i === undefined
							? null
							: `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`,
				}));
		}
	}
	if (typeof data === "object" && data !== null && "results" in data) {
		const results = (data as { results: unknown }).results;
		if (Array.isArray(results)) {
			return results
				.filter(
					(m): m is { id: number; title?: string; name?: string; poster_path?: string | null } =>
						typeof m === "object" && m !== null,
				)
				.map((m) => ({
					id: String(m.id),
					name: m.title ?? m.name ?? "",
					cover: m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : null,
				}));
		}
	}
	return [];
}

async function searchNew(type: MemberType, query: string): Promise<SearchHit[]> {
	const source = TYPE_TO_SOURCE[type];
	const tmdbType = type === "tv" ? "tv" : "movie";
	try {
		const url = `${API_URL}/search?source=${source}&query=${encodeURIComponent(query)}&type=${tmdbType}`;
		const response = await fetch(url, { credentials: "include" });
		const data: unknown = await response.json();
		return parseNewResults(data, type)
			.slice(0, 6)
			.map((hit) => ({
				label: `${hit.name} · add new (planned)`,
				cover: hit.cover,
				member: { kind: "new", name: hit.name, sourceId: hit.id, type },
			}));
	} catch (error) {
		console.error("New search failed:", error);
		return [];
	}
}

function initCreateModal() {
	// The create modal only exists on the list page; bail out elsewhere.
	const openBtnRaw = document.getElementById("add-collection-btn");
	if (!(openBtnRaw instanceof HTMLButtonElement)) {
		return;
	}
	const openBtn: HTMLButtonElement = openBtnRaw;
	const modal = byId<HTMLElement>("collection-modal");
	const closeBtn = byId<HTMLButtonElement>("collection-close");
	const form = byId<HTMLFormElement>("collection-form");
	const titleInput = byId<HTMLInputElement>("collection-title");
	const descriptionInput = byId<HTMLTextAreaElement>("collection-description");
	const typeSelect = byId<HTMLSelectElement>("collection-member-type");
	const memberSearch = byId<HTMLInputElement>("collection-member-search");
	const resultsEl = byId<HTMLElement>("collection-member-results");
	const membersEl = byId<HTMLUListElement>("collection-members");
	const errorEl = byId<HTMLElement>("collection-error");
	const passwordInput = byId<HTMLInputElement>("collection-password");
	const skipCi = byId<HTMLInputElement>("collection-skip-ci");

	const members: Member[] = [];

	function setError(message: string | null) {
		if (message === null) {
			setHidden(errorEl, true);
			errorEl.textContent = "";
		} else {
			errorEl.textContent = message;
			setHidden(errorEl, false);
		}
	}

	function renderMembers() {
		membersEl.innerHTML = "";
		for (const [index, member] of members.entries()) {
			const li = document.createElement("li");
			li.className = "flex items-center justify-between gap-2 bg-zinc-100 rounded px-2 py-1";
			const label = document.createElement("span");
			label.className = "truncate";
			const tag = member.kind === "new" ? "🆕" : "📁";
			label.textContent = `${tag} ${member.name} (${member.type})`;
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "text-red-700 font-bold text-lg leading-none px-1";
			remove.textContent = "×";
			remove.addEventListener("click", () => {
				members.splice(index, 1);
				renderMembers();
			});
			li.append(label, remove);
			membersEl.append(li);
		}
	}

	function addMember(member: Member) {
		const duplicate = members.some(
			(m) => m.type === member.type && (m.slug ?? m.sourceId) === (member.slug ?? member.sourceId),
		);
		if (!duplicate) {
			members.push(member);
			renderMembers();
		}
		memberSearch.value = "";
		setHidden(resultsEl, true);
		resultsEl.innerHTML = "";
	}

	function renderResults(hits: SearchHit[]) {
		resultsEl.innerHTML = "";
		setHidden(resultsEl, hits.length === 0);
		for (const hit of hits) {
			const row = document.createElement("button");
			row.type = "button";
			row.className =
				"flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-zinc-200 text-sm";
			if (hit.cover === null) {
				const placeholder = document.createElement("div");
				placeholder.className = "w-8 h-12 bg-zinc-300 shrink-0";
				row.append(placeholder);
			} else {
				const img = document.createElement("img");
				img.src = hit.cover;
				img.className = "w-8 h-12 object-cover shrink-0";
				img.loading = "lazy";
				row.append(img);
			}
			const label = document.createElement("span");
			label.className = "truncate";
			label.textContent = hit.label;
			row.append(label);
			row.addEventListener("click", () => {
				addMember(hit.member);
			});
			resultsEl.append(row);
		}
	}

	let debounce: number | undefined;
	memberSearch.addEventListener("input", () => {
		window.clearTimeout(debounce);
		debounce = window.setTimeout(() => {
			void (async () => {
				const query = memberSearch.value.trim();
				const typeValue = typeSelect.value;
				if (query === "" || !isMemberType(typeValue)) {
					setHidden(resultsEl, true);
					return;
				}
				const entries = await loadLocalCatalogue();
				const existing = searchExisting(entries, typeValue, query);
				const fresh = await searchNew(typeValue, query);
				renderResults([...existing, ...fresh]);
			})();
		}, 400);
	});

	function openModal() {
		setHidden(modal, false);
		setError(null);
	}
	function closeModal() {
		setHidden(modal, true);
		members.length = 0;
		renderMembers();
		titleInput.value = "";
		descriptionInput.value = "";
		memberSearch.value = "";
		resultsEl.innerHTML = "";
		setHidden(resultsEl, true);
		setError(null);
	}

	openBtn.addEventListener("click", openModal);
	closeBtn.addEventListener("click", closeModal);
	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			closeModal();
		}
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		void (async () => {
			if (titleInput.value.trim() === "") {
				setError("Please give the collection a title");
				return;
			}
			if (members.length === 0) {
				setError("Add at least one member");
				return;
			}
			if (passwordInput.value === "") {
				setError("Password is required");
				return;
			}
			setError(null);
			const payload = {
				"form-password": passwordInput.value,
				"skip-ci": skipCi.checked,
				title: titleInput.value.trim(),
				description: descriptionInput.value,
				members: members.map((m) =>
					m.kind === "existing"
						? { name: m.name, slug: m.slug ?? "", type: m.type }
						: { name: m.name, "source-id": m.sourceId ?? "", status: "planned", type: m.type },
				),
			};
			try {
				const response = await fetch(`${API_URL}/commit-collection`, {
					body: JSON.stringify(payload),
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					method: "POST",
				});
				if (!response.ok) {
					setError(`Failed: ${await response.text()}`);
					return;
				}
				closeModal();
			} catch (error) {
				console.error("Submit failed:", error);
				setError("An error occurred");
			}
		})();
	});

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
				setHidden(openBtn, false);
			}
		} catch (error) {
			console.error("Auth check failed:", error);
		}
	}
	void checkAuth();
}

initFilters();
initCreateModal();

export {};
