// Keeps the sidebar filter controls in sync with the URL query string, so a
// filtered catalogue/stats view can be linked and survives a reload. Shared by
// catalogue.ts and stats.ts, which drive the same paired mobile/desktop controls.

interface Field {
	// URL query param name.
	param: string;
	// Control suffix shared by the `#catalogue-<key>` / `#mobile-catalogue-<key>` pair.
	key: string;
	// The control is a checkbox (encoded as "1" when checked, absent otherwise).
	checkbox?: boolean;
}

const FIELDS: Field[] = [
	{ param: "search", key: "search" },
	{ param: "type", key: "types" },
	{ param: "status", key: "status" },
	{ param: "rating", key: "ratings" },
	{ param: "from", key: "date-from" },
	{ param: "to", key: "date-to" },
	{ param: "sort", key: "sort" },
	{ param: "dir", key: "sort-ord", checkbox: true },
	{ param: "collection", key: "collection" },
];

type Control = HTMLInputElement | HTMLSelectElement;

function controls(key: string): Control[] {
	return [...document.querySelectorAll<Control>(`#catalogue-${key}, #mobile-catalogue-${key}`)];
}

function fieldValue(el: Control, field: Field): string {
	if (field.checkbox && el instanceof HTMLInputElement) {
		return el.checked ? "1" : "";
	}
	return el.value;
}

// Server-rendered defaults, captured once from the pristine DOM so writeFiltersToUrl
// can omit any control still at its default and keep URLs minimal. Defaults differ
// per page (e.g. status "finished" vs "all"), hence reading them from the markup.
const defaults = new Map<string, string>();
let captured = false;

function captureDefaults(): void {
	if (captured) {
		return;
	}
	captured = true;
	for (const field of FIELDS) {
		const el = controls(field.key)[0];
		if (el !== undefined) {
			defaults.set(field.key, fieldValue(el, field));
		}
	}
}

// Apply the URL's query params to the sidebar inputs (both mobile + desktop of each
// pair). Only touches params that are present and controls that exist on the page.
// Call before the first render. Safe to call again once async-populated <select>s
// (the collection list) have their options, so a linked value can take effect.
export function applyUrlToFilters(): void {
	captureDefaults();
	const params = new URLSearchParams(window.location.search);
	for (const field of FIELDS) {
		if (!params.has(field.param)) {
			continue;
		}
		const value = params.get(field.param) ?? "";
		for (const el of controls(field.key)) {
			if (field.checkbox && el instanceof HTMLInputElement) {
				el.checked = value === "1";
			} else {
				el.value = value;
			}
		}
	}
}

// Write the current sidebar state to the URL via replaceState (no history spam).
// Controls at their default are dropped; unrelated params (e.g. `entry`) are kept.
export function writeFiltersToUrl(): void {
	captureDefaults();
	const url = new URL(window.location.href);
	const params = url.searchParams;
	let changed = false;
	for (const field of FIELDS) {
		const el = controls(field.key)[0];
		if (el === undefined) {
			continue;
		}
		const value = fieldValue(el, field);
		const isDefault = value === "" || value === (defaults.get(field.key) ?? "");
		if (isDefault) {
			if (params.has(field.param)) {
				params.delete(field.param);
				changed = true;
			}
		} else if (params.get(field.param) !== value) {
			params.set(field.param, value);
			changed = true;
		}
	}
	if (changed) {
		history.replaceState(null, "", url);
	}
}
