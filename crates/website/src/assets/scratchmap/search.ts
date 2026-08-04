// Local-first region search. Everything the map can show is already in memory, so the
// index is built once from the same regions the badges come from and never refetched.
import * as L from "leaflet";
import { QuickScore } from "quick-score";
import { type Regions, type SearchEntry, formatPercent } from "./regions";

// Region names keep their native spelling, and QuickScore lowercases but does not fold
// diacritics. Without this, "montreal" never reaches "Montréal".
const foldForSearch = (value: string): string =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase();

const LEVEL_LABEL: Record<string, string> = {
	city: "City",
	country: "Country",
	district: "District",
};
const levelLabel = (level: string) => LEVEL_LABEL[level] ?? level;

// Ties are same-name regions that nest. Walked before unwalked, then widest first: a bare
// name usually means the larger place, and zooming in from there is one click.
const LEVEL_RANK: Record<string, number> = { city: 1, country: 0, district: 2 };
const entryRank = (entry: SearchEntry) =>
	(entry.explored > 0 ? 0 : 3) + (LEVEL_RANK[entry.level] ?? 3);

const RESULT_LIMIT = 8;

const MUTED = "color:#4d4d4d;font-size:11px";
const ELLIPSIS = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

const PANEL_CLASS = "scratchmap-search";
const ROW_CLASS = "scratchmap-search-option";

const SEARCH_ICON =
	'<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>';

// Hover stays in CSS so it cannot move the keyboard selection, which aria-activedescendant
// reports to a screen reader; a passing mouse must not relocate that. Both tints are
// orange-carrot, as the map's highlight uses.
//
// Type size and hit areas live here too, so a coarse pointer can override them: iOS Safari
// zooms the page in when a focused input is under 16px and never zooms back out, and a
// 41px row is under the 44px a thumb needs.
const STYLES = `.${ROW_CLASS}:hover{background:rgba(249,160,63,0.18)}
.${ROW_CLASS}[aria-selected="true"]{background:rgba(249,160,63,0.35)}
.${PANEL_CLASS} input{padding:6px 8px;font:400 13px/1.3 system-ui,sans-serif}
.${ROW_CLASS}{padding:5px 8px}
.${PANEL_CLASS}-panel{width:240px;max-width:70vw;background:#f7f7f7;border:1px solid rgba(10,9,8,0.12);border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.25);overflow:hidden}
@media (pointer:coarse){
.${PANEL_CLASS} input{padding:10px 8px;font-size:16px}
.${ROW_CLASS}{padding:8px}
}`;

// The name carries the percentage; what tells two same-name places apart goes on the line
// under it, where a long country name has room to sit.
const buildRow = (entry: SearchEntry, position: number, regions: Regions): HTMLElement => {
	const row = L.DomUtil.create("li", ROW_CLASS);
	row.id = `scratchmap-search-option-${position}`;
	row.setAttribute("role", "option");
	row.style.cssText = "cursor:pointer;color:#0a0908";

	const title = L.DomUtil.create("div", "", row);
	title.style.cssText = "display:flex;gap:8px;justify-content:space-between;align-items:baseline";

	const name = L.DomUtil.create("span", "", title);
	name.textContent = entry.name;
	name.style.cssText = ELLIPSIS;

	// A country nobody walked has an outline but no percentage to show.
	const percent = regions.regionPercent(entry.key);
	if (percent !== null) {
		const share = L.DomUtil.create("span", "", title);
		share.textContent = formatPercent(percent);
		share.style.cssText = `flex:none;${MUTED}`;
	}

	const context = regions.regionContext(entry);
	const hint = L.DomUtil.create("div", "", row);
	hint.textContent =
		context === null ? levelLabel(entry.level) : `${levelLabel(entry.level)} · ${context}`;
	hint.style.cssText = `${MUTED};${ELLIPSIS}`;

	return row;
};

// A touch viewer has no pointer to hover with, and the on-screen keyboard covers the map
// the search just framed.
const HOVER_CAPABLE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function addSearchControl(map: L.Map, regions: Regions): void {
	const index = new QuickScore(regions.searchEntries, {
		keys: ["name"],
		minimumScore: 0.2,
		transformString: foldForSearch,
	});

	const styles = document.createElement("style");
	styles.textContent = STYLES;
	document.head.append(styles);

	const SearchControl = L.Control.extend({
		onAdd() {
			const container = L.DomUtil.create("div", `leaflet-control ${PANEL_CLASS}`);

			// Collapsed, this is one of the map's own bar buttons; `leaflet-bar` on the
			// container is what gives it that look, so it comes off once the panel is out.
			const toggle = L.DomUtil.create("a", "", container) as HTMLAnchorElement;
			toggle.href = "#";
			toggle.setAttribute("role", "button");
			toggle.setAttribute("aria-controls", "scratchmap-search-panel");
			toggle.title = "Search regions";
			toggle.setAttribute("aria-label", "Search regions");
			toggle.style.cssText = "align-items:center;justify-content:center";
			toggle.innerHTML = SEARCH_ICON;

			const panel = L.DomUtil.create("div", `${PANEL_CLASS}-panel`, container);
			panel.id = "scratchmap-search-panel";

			const input = L.DomUtil.create("input", "", panel) as HTMLInputElement;
			input.type = "search";
			input.placeholder = "Search regions";
			input.autocomplete = "off";
			input.setAttribute("aria-label", "Search regions");
			input.setAttribute("role", "combobox");
			input.setAttribute("aria-autocomplete", "list");
			input.setAttribute("aria-expanded", "false");
			input.setAttribute("aria-controls", "scratchmap-search-results");
			input.style.cssText =
				"display:block;box-sizing:border-box;width:100%;border:0;background:transparent;outline:none;color:#0a0908";

			const list = L.DomUtil.create("ul", "", panel) as HTMLUListElement;
			list.id = "scratchmap-search-results";
			list.setAttribute("role", "listbox");
			list.setAttribute("aria-label", "Region results");
			list.style.cssText =
				"display:none;margin:0;padding:0;overflow-y:auto;list-style:none;border-top:1px solid rgba(10,9,8,0.12)";

			// aria-expanded alone is not announced when it changes, so the count is said out
			// loud instead. Off-screen rather than hidden: display:none is never announced.
			const status = L.DomUtil.create("div", "", panel);
			status.setAttribute("role", "status");
			status.style.cssText =
				"position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";

			let results: SearchEntry[] = [];
			let active = -1;

			const setOpen = (open: boolean) => {
				container.className = open
					? `leaflet-control ${PANEL_CLASS}`
					: `leaflet-control leaflet-bar ${PANEL_CLASS}`;
				toggle.style.display = open ? "none" : "flex";
				panel.style.display = open ? "block" : "none";
				toggle.setAttribute("aria-expanded", String(open));
			};

			// Returning focus to the button is right only when the viewer dismissed the panel
			// themselves; clicking the map away from it must not pull focus back.
			const collapse = (returnFocus: boolean) => {
				close();
				setOpen(false);
				if (returnFocus) toggle.focus();
			};

			setOpen(false);
			L.DomEvent.on(toggle, "click", (event) => {
				L.DomEvent.stop(event);
				setOpen(true);
				input.focus();
			});

			const paint = () => {
				for (const [position, row] of [...list.children].entries()) {
					row.setAttribute("aria-selected", String(position === active));
				}
				if (active < 0) input.removeAttribute("aria-activedescendant");
				else input.setAttribute("aria-activedescendant", `scratchmap-search-option-${active}`);
			};

			const choose = (position: number) => {
				const entry = results[position];
				if (!entry) return;
				input.value = entry.name;
				regions.focusRegion(entry);
				close();
				// A pointer user keeps the caret and the panel, ready to refine. On touch the
				// keyboard and the panel would both sit over the region just framed, so the
				// whole thing folds back to its button.
				if (!HOVER_CAPABLE) {
					input.blur();
					collapse(false);
				}
			};

			const render = () => {
				list.replaceChildren();
				for (const [position, entry] of results.entries()) {
					const row = buildRow(entry, position, regions);
					// Holding focus in the input keeps the list alive for the click that follows.
					// Click then does the picking, since it fires for the primary button alone —
					// a right- or middle-click on a result must not move the map.
					row.addEventListener("mousedown", (event) => {
						event.preventDefault();
					});
					row.addEventListener("click", () => {
						choose(position);
					});
					list.append(row);
				}
				// The panel must not outgrow the map under it: a phone held sideways has less
				// height than eight two-line rows, and the list would cover the map entirely.
				list.style.maxHeight = `${Math.max(96, Math.min(260, map.getSize().y - 72))}px`;
				list.style.display = results.length > 0 ? "block" : "none";
				input.setAttribute("aria-expanded", String(results.length > 0));
				status.textContent =
					results.length === 0 ? "" : `${results.length} region${results.length === 1 ? "" : "s"}`;
				paint();
			};

			const close = () => {
				// Choosing blurs the input, and blur closes too; without this the list
				// rebuilds twice for one selection.
				if (results.length === 0) return;
				results = [];
				active = -1;
				render();
			};

			const update = () => {
				const query = input.value.trim();
				results =
					query === ""
						? []
						: index
								.search(query)
								.sort(
									(a, b) =>
										b.score - a.score ||
										entryRank(a.item) - entryRank(b.item) ||
										// Two of the same name, both walked: the one walked more is the
										// one more likely meant.
										b.item.explored - a.item.explored,
								)
								.slice(0, RESULT_LIMIT)
								.map((result) => result.item);
				active = results.length > 0 ? 0 : -1;
				render();
			};

			input.addEventListener("input", update);
			input.addEventListener("focus", update);
			input.addEventListener("blur", () => {
				close();
				// An empty box that lost focus is only clutter. A query part-way through is
				// not, so it survives a click on the map.
				if (input.value === "") collapse(false);
			});
			input.addEventListener("keydown", (event) => {
				// An IME drives its candidate list with the same keys. Committing "Montréal"
				// must not also pick a result out from under the composition.
				if (event.isComposing) return;

				const count = results.length;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					if (count === 0) return;
					event.preventDefault();
					active =
						event.key === "ArrowDown"
							? (active + 1) % count
							: active < 0
								? count - 1
								: (active + count - 1) % count;
					paint();
					list.children[active]?.scrollIntoView({ block: "nearest" });
				} else if (event.key === "Enter") {
					// Nothing selected: leave Enter to the page rather than swallowing it.
					if (active < 0) return;
					event.preventDefault();
					choose(active);
				} else if (event.key === "Escape") {
					// Dismiss the list first, fold the panel away second, so a query survives a
					// look at the map. The preventDefault suppresses the native clear
					// `type="search"` does on Escape, which would collapse both steps into one.
					event.preventDefault();
					if (count > 0) close();
					else collapse(true);
				}
			});

			L.DomEvent.disableClickPropagation(container);
			L.DomEvent.disableScrollPropagation(container);
			// The pointer highlight tracks the map, not the panel over it, and the arrow keys
			// walking the results must not pan the map underneath.
			L.DomEvent.on(container, "mousemove keydown keypress", L.DomEvent.stopPropagation);

			return container;
		},
	});

	map.addControl(new SearchControl({ position: "topleft" }));
}
