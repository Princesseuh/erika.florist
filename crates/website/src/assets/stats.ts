import {
	type CatalogueRecord,
	type CatalogueType as EntryType,
	type CollectionRef,
	loadCatalogueCache,
} from "./catalogue-db";

function requireElement<T extends Element>(selector: string): T {
	const el = document.querySelector<T>(selector);
	if (el === null) {
		throw new Error(`Required element not found: ${selector}`);
	}
	return el;
}

const statsCore = requireElement<HTMLElement>("#stats-core");
const statsContent = requireElement<HTMLElement>("#stats-content");
const countElements = document.querySelectorAll("#stats-entry-count");
const latestHash = statsCore.dataset.latest ?? "";

interface Entry {
	title: string;
	type: EntryType;
	rating: number | null;
	status: "finished" | "planned";
	date: number | null;
	year: number | null;
	studio: string | null;
	genres: string[];
	runtime: number | null;
	collections: string[];
}

/* ------------------------------------------------------------------ *
 * Theme tokens — kept in sync with prin.css so charts match the site.
 * ------------------------------------------------------------------ */

const COLOR = {
	accent: "#c73c2e",
	violet: "#52489c",
	orange: "#f9a03f",
	teal: "#3f8f7d",
	charcoal: "#0a0908",
	subtle: "#4d4d4d",
	sugar: "#f7f7f7",
};

const TYPE_COLOR: Record<EntryType, string> = {
	game: COLOR.accent,
	movie: COLOR.violet,
	show: COLOR.orange,
	book: COLOR.teal,
};

const TYPE_LABEL: Record<EntryType, string> = {
	game: "Games",
	movie: "Movies",
	show: "Shows",
	book: "Books",
};

// Hated → Masterpiece, warm (bad) to cool (good), staying inside the site palette.
const RATING_COLOR = ["#6f2019", "#b23a2c", "#e0662f", "#f9a03f", "#7a6fb8", "#52489c"];
const RATING_LABEL = ["Hated", "Disliked", "Okay", "Liked", "Loved", "Masterpiece"];
const RATING_EMOJI = ["🙁", "😕", "😐", "🙂", "🥰", "❤️"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function esc(value: string): string {
	return value.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

function truncate(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatNumber(value: number): string {
	return value.toLocaleString("en-US");
}

function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);
	return hours === 0 ? `${mins}m` : `${hours}h ${mins}m`;
}

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace("#", "");
	return [
		Number.parseInt(clean.slice(0, 2), 16),
		Number.parseInt(clean.slice(2, 4), 16),
		Number.parseInt(clean.slice(4, 6), 16),
	];
}

function mixColor(from: string, to: string, t: number): string {
	const [r1, g1, b1] = hexToRgb(from);
	const [r2, g2, b2] = hexToRgb(to);
	const r = Math.round(r1 + (r2 - r1) * t);
	const g = Math.round(g1 + (g2 - g1) * t);
	const b = Math.round(b1 + (b2 - b1) * t);
	return `rgb(${r}, ${g}, ${b})`;
}

/* ------------------------------------------------------------------ *
 * SVG chart primitives
 * ------------------------------------------------------------------ */

function svgWrap(width: number, height: number, inner: string): string {
	return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" font-family="'IBM Plex', sans-serif" style="max-width:100%;height:auto">${inner}</svg>`;
}

function emptyChart(): string {
	return `<p class="text-sm text-subtle-charcoal text-center py-8">Nothing to chart for this selection.</p>`;
}

interface Bar {
	label: string;
	// Hover text when the visible label is abbreviated (e.g. an emoji); defaults to label.
	title?: string;
	// Optional second line rendered under the x-axis label (e.g. the numeric rating).
	sublabel?: string;
	value: number;
	color: string;
}

function verticalBars(bars: Bar[], unit: string, maxOverride?: number): string {
	if (bars.length === 0) {
		return emptyChart();
	}
	// Design width matches the ~360px masonry column so text renders ~1:1, not shrunk.
	const width = 360;
	const height = 220;
	const padL = 22;
	const padR = 8;
	const padT = 20;
	const padB = 50;
	const plotW = width - padL - padR;
	const plotH = height - padT - padB;
	const max = maxOverride ?? Math.max(1, ...bars.map((b) => b.value));
	const n = bars.length;
	const gap = n > 24 ? 1 : 4;
	const barW = (plotW - gap * (n - 1)) / n;
	const rotate = n > 8;
	const labelEvery = Math.max(1, Math.ceil(n / 16));

	let body = `<line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="${COLOR.charcoal}" stroke-opacity="0.2"/>`;

	bars.forEach((bar, i) => {
		const h = (bar.value / max) * plotH;
		const x = padL + i * (barW + gap);
		const y = padT + plotH - h;
		const cx = x + barW / 2;
		body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="1.5" fill="${bar.color}"><title>${esc(bar.title ?? bar.label)}: ${bar.value} ${esc(unit)}</title></rect>`;
		if (barW >= 16 && bar.value > 0) {
			body += `<text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="15" fill="${COLOR.subtle}">${bar.value}</text>`;
		}
		if (i % labelEvery === 0) {
			const ly = padT + plotH + 18;
			body += rotate
				? `<text x="${cx.toFixed(1)}" y="${ly}" text-anchor="end" font-size="14" fill="${COLOR.subtle}" transform="rotate(-42 ${cx.toFixed(1)} ${ly})">${esc(truncate(bar.label, 14))}</text>`
				: `<text x="${cx.toFixed(1)}" y="${ly}" text-anchor="middle" font-size="15" fill="${COLOR.subtle}">${esc(truncate(bar.label, 12))}</text>`;
			if (bar.sublabel !== undefined) {
				body += `<text x="${cx.toFixed(1)}" y="${(ly + 16).toFixed(1)}" text-anchor="middle" font-size="13" fill="${COLOR.subtle}">${esc(bar.sublabel)}</text>`;
			}
		}
	});

	return svgWrap(width, height, body);
}

interface HBar {
	label: string;
	value: number;
	color: string;
	valueLabel: string;
}

function horizontalBars(rows: HBar[], maxValue: number | null): string {
	if (rows.length === 0) {
		return emptyChart();
	}
	// Design width matches the ~360px masonry column so text renders ~1:1, not shrunk.
	const width = 360;
	const rowH = 26;
	const gap = 7;
	const padT = 4;
	const padB = 4;
	const labelW = 158;
	const valueW = 52;
	const plotX = labelW;
	const plotW = width - labelW - valueW;
	const max = maxValue ?? Math.max(1, ...rows.map((r) => r.value));
	const height = padT + padB + rows.length * rowH + (rows.length - 1) * gap;

	let body = "";
	rows.forEach((row, i) => {
		const y = padT + i * (rowH + gap);
		const barW = Math.max(2, (row.value / max) * plotW);
		const midY = y + rowH / 2;
		body += `<text x="${labelW - 8}" y="${midY}" text-anchor="end" dominant-baseline="middle" font-size="14" fill="${COLOR.charcoal}">${esc(truncate(row.label, 21))}<title>${esc(row.label)}</title></text>`;
		body += `<rect x="${plotX}" y="${y}" width="${barW.toFixed(1)}" height="${rowH}" rx="2" fill="${row.color}"><title>${esc(row.label)}: ${esc(row.valueLabel)}</title></rect>`;
		body += `<text x="${(plotX + barW + 6).toFixed(1)}" y="${midY}" dominant-baseline="middle" font-size="13" fill="${COLOR.subtle}">${esc(row.valueLabel)}</text>`;
	});

	return svgWrap(width, height, body);
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
	return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function annularSlice(
	cx: number,
	cy: number,
	rOuter: number,
	rInner: number,
	a0: number,
	a1: number,
	color: string,
	title: string,
): string {
	const largeArc = a1 - a0 > Math.PI ? 1 : 0;
	const [x0, y0] = polar(cx, cy, rOuter, a0);
	const [x1, y1] = polar(cx, cy, rOuter, a1);
	const [x2, y2] = polar(cx, cy, rInner, a1);
	const [x3, y3] = polar(cx, cy, rInner, a0);
	const d = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
	const titleTag = title === "" ? "" : `<title>${esc(title)}</title>`;
	return `<path d="${d}" fill="${color}">${titleTag}</path>`;
}

interface Slice {
	label: string;
	value: number;
	color: string;
}

function donut(slices: Slice[], centerLabel: string): string {
	const active = slices.filter((s) => s.value > 0);
	const total = active.reduce((sum, s) => sum + s.value, 0);
	if (total === 0) {
		return emptyChart();
	}
	const size = 200;
	const cx = size / 2;
	const cy = size / 2;
	const rOuter = 92;
	const rInner = 56;
	let angle = -Math.PI / 2;
	let arcs = "";
	for (const slice of active) {
		const frac = slice.value / total;
		const end = angle + frac * Math.PI * 2;
		const title = `${slice.label}: ${slice.value} (${Math.round(frac * 100)}%)`;
		if (end - angle >= Math.PI * 2 - 1e-6) {
			const mid = angle + Math.PI;
			arcs += annularSlice(cx, cy, rOuter, rInner, angle, mid, slice.color, title);
			arcs += annularSlice(cx, cy, rOuter, rInner, mid, end, slice.color, "");
		} else {
			arcs += annularSlice(cx, cy, rOuter, rInner, angle, end, slice.color, title);
		}
		angle = end;
	}
	const center = `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="30" font-weight="700" fill="${COLOR.charcoal}">${total}</text><text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="18" fill="${COLOR.subtle}">${esc(centerLabel)}</text>`;
	const chart = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="auto" font-family="'IBM Plex', sans-serif">${arcs}${center}</svg>`;

	const legend = active
		.map(
			(slice) =>
				`<div class="flex items-center gap-2 text-sm"><span class="inline-block w-3 h-3 rounded-sm shrink-0" style="background:${slice.color}"></span><span>${esc(slice.label)}</span><span class="text-subtle-charcoal ml-auto tabular-nums whitespace-nowrap">${slice.value} · ${Math.round((slice.value / total) * 100)}%</span></div>`,
		)
		.join("");

	return `<div class="flex flex-col sm:flex-row items-center gap-4"><div class="w-[144px] shrink-0">${chart}</div><div class="flex-1 min-w-0 w-full flex flex-col gap-2">${legend}</div></div>`;
}

interface LinePoint {
	label: string;
	value: number | null;
	count: number;
}

function ratingLine(points: LinePoint[]): string {
	if (points.filter((p) => p.value !== null).length === 0) {
		return emptyChart();
	}
	// Design width matches the ~360px masonry column so text renders ~1:1, not shrunk.
	const width = 360;
	const height = 210;
	const padL = 20;
	const padR = 12;
	const padT = 12;
	const padB = 40;
	const plotW = width - padL - padR;
	const plotH = height - padT - padB;
	const n = points.length;
	const xFor = (i: number): number => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
	const yFor = (v: number): number => padT + plotH - (v / 5) * plotH;

	let grid = "";
	for (let g = 0; g <= 5; g += 1) {
		const y = yFor(g);
		grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="${COLOR.charcoal}" stroke-opacity="${g === 0 ? 0.2 : 0.07}"/>`;
		grid += `<text x="${padL - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="${COLOR.subtle}">${g}</text>`;
	}

	let segments = "";
	let dots = "";
	let labels = "";
	const labelEvery = Math.max(1, Math.ceil(n / 10));
	let prev: { x: number; y: number } | null = null;
	points.forEach((point, i) => {
		const x = xFor(i);
		if (point.value !== null) {
			const y = yFor(point.value);
			if (prev !== null) {
				segments += `<line x1="${prev.x.toFixed(1)}" y1="${prev.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${COLOR.accent}" stroke-width="2.5" stroke-linecap="round"/>`;
			}
			dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${COLOR.accent}"><title>${esc(point.label)}: ${point.value.toFixed(2)} avg (${point.count})</title></circle>`;
			prev = { x, y };
		} else {
			prev = null;
		}
		if (i % labelEvery === 0) {
			labels += `<text x="${x.toFixed(1)}" y="${height - padB + 18}" text-anchor="middle" font-size="13" fill="${COLOR.subtle}">${esc(truncate(point.label, 10))}</text>`;
		}
	});

	return svgWrap(width, height, grid + segments + dots + labels);
}

function activityHeatmap(entries: Entry[]): string {
	const dated = entries.filter((e) => e.date !== null);
	if (dated.length === 0) {
		return emptyChart();
	}
	const byYear = new Map<number, number[]>();
	let maxCell = 1;
	for (const entry of dated) {
		const d = new Date(entry.date as number);
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth();
		let row = byYear.get(year);
		if (row === undefined) {
			row = Array.from({ length: 12 }, () => 0);
			byYear.set(year, row);
		}
		const next = (row[month] ?? 0) + 1;
		row[month] = next;
		if (next > maxCell) {
			maxCell = next;
		}
	}
	const years = [...byYear.keys()].sort((a, b) => a - b);
	const cell = 20;
	const cellGap = 3;
	const labelW = 38;
	const topH = 20;
	const width = labelW + 12 * (cell + cellGap);
	const height = topH + years.length * (cell + cellGap);

	let body = "";
	for (let m = 0; m < 12; m += 1) {
		const x = labelW + m * (cell + cellGap) + cell / 2;
		body += `<text x="${x.toFixed(1)}" y="14" text-anchor="middle" font-size="13" fill="${COLOR.subtle}">${MONTHS[m]?.charAt(0)}</text>`;
	}
	years.forEach((year, r) => {
		const row = byYear.get(year) ?? [];
		const y = topH + r * (cell + cellGap);
		body += `<text x="${labelW - 7}" y="${(y + cell / 2 + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="${COLOR.subtle}">${year}</text>`;
		for (let m = 0; m < 12; m += 1) {
			const count = row[m] ?? 0;
			const x = labelW + m * (cell + cellGap);
			const fill =
				count === 0 ? "#ececec" : mixColor("#f6ddd8", COLOR.accent, 0.2 + 0.8 * (count / maxCell));
			body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"><title>${MONTHS[m]} ${year}: ${count}</title></rect>`;
		}
	});

	// Natural pixel size, capped at the container width — otherwise a 100%-wide
	// SVG blows the small grid up to fill the whole card.
	const svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" font-family="'IBM Plex', sans-serif" style="max-width:100%;height:auto">${body}</svg>`;
	return `<div class="flex justify-center">${svg}</div>`;
}

/* ------------------------------------------------------------------ *
 * Card + stat scaffolding
 * ------------------------------------------------------------------ */

// Flat, bordered, no fill — matches the site's article/wiki cards, not a gray box.
function card(title: string, qualifier: string, body: string): string {
	const q =
		qualifier === ""
			? ""
			: ` <span class="text-sm font-normal text-subtle-charcoal">${esc(qualifier)}</span>`;
	return `<section class="border border-solid border-accent-valencia/15 p-5">
		<h2 class="text-xl font-bold text-accent-valencia tracking-tight leading-tight m-0 mb-3">${esc(title)}${q}</h2>
		${body}
	</section>`;
}

function fact(value: string, label: string, color: string): string {
	return `<section class="border border-solid border-accent-valencia/15 p-5">
		<div class="text-3xl font-bold leading-none tabular-nums" style="color:${color}">${esc(value)}</div>
		<div class="text-black-charcoal font-medium mt-1.5">${esc(label)}</div>
	</section>`;
}

// Editable "min rated entries" cutoffs, shown inline in the best-rated / polarizing titles.
let studioMinRated = 2;
let genreMinRated = 2;
let studioPolarMinRated = 3;
let genrePolarMinRated = 3;

// Like card(), but the title control is raw HTML (an inline input), so it isn't escaped.
function cardControl(title: string, control: string, body: string): string {
	return `<section class="border border-solid border-accent-valencia/15 p-5">
		<h2 class="text-xl font-bold text-accent-valencia tracking-tight leading-tight m-0 mb-3">${esc(title)} ${control}</h2>
		${body}
	</section>`;
}

function thresholdInput(id: string, value: number): string {
	return `<span class="text-sm font-normal text-subtle-charcoal inline-flex items-center align-middle gap-1"><input id="${id}" type="number" min="1" value="${value}" aria-label="Minimum rated entries" class="w-11 px-1 py-0.5 border border-black/25 rounded text-center bg-white text-black text-sm" />+ rated</span>`;
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

interface Tally {
	count: number;
	sum: number;
	sumSq: number;
	rated: number;
	types: Map<EntryType, number>;
}

function tallyBy(items: Entry[], keys: (entry: Entry) => string[]): Map<string, Tally> {
	const map = new Map<string, Tally>();
	for (const entry of items) {
		for (const key of keys(entry)) {
			if (key === "") {
				continue;
			}
			let tally = map.get(key);
			if (tally === undefined) {
				tally = { count: 0, sum: 0, sumSq: 0, rated: 0, types: new Map() };
				map.set(key, tally);
			}
			tally.count += 1;
			tally.types.set(entry.type, (tally.types.get(entry.type) ?? 0) + 1);
			if (entry.rating !== null) {
				tally.sum += entry.rating;
				tally.sumSq += entry.rating * entry.rating;
				tally.rated += 1;
			}
		}
	}
	return map;
}

// The media type contributing the most entries — colors the bar like the "By type" legend.
function dominantType(tally: Tally): EntryType {
	let best: EntryType = "game";
	let bestCount = -1;
	for (const type of ["game", "movie", "show", "book"] as EntryType[]) {
		const count = tally.types.get(type) ?? 0;
		if (count > bestCount) {
			bestCount = count;
			best = type;
		}
	}
	return best;
}

function topByCount(map: Map<string, Tally>, limit: number): HBar[] {
	return [...map.entries()]
		.sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([label, tally]) => ({
			label,
			value: tally.count,
			color: TYPE_COLOR[dominantType(tally)],
			valueLabel: String(tally.count),
		}));
}

function topByRating(map: Map<string, Tally>, minRated: number, limit: number): HBar[] {
	return [...map.entries()]
		.filter(([, tally]) => tally.rated >= minRated)
		.map(([label, tally]) => ({ label, avg: tally.sum / tally.rated, rated: tally.rated, tally }))
		.sort((a, b) => b.avg - a.avg || b.rated - a.rated || a.label.localeCompare(b.label))
		.slice(0, limit)
		.map((item) => ({
			label: item.label,
			value: item.avg,
			color: TYPE_COLOR[dominantType(item.tally)],
			valueLabel: `${item.avg.toFixed(1)} · ${item.rated}`,
		}));
}

// Ranked by rating spread (population std dev) — the "you either love it or hate it" list.
function topByPolarizing(map: Map<string, Tally>, minRated: number, limit: number): HBar[] {
	return [...map.entries()]
		.filter(([, tally]) => tally.rated >= minRated)
		.map(([label, tally]) => {
			const mean = tally.sum / tally.rated;
			const std = Math.sqrt(Math.max(0, tally.sumSq / tally.rated - mean * mean));
			return { label, std, rated: tally.rated, tally };
		})
		.sort((a, b) => b.std - a.std || b.rated - a.rated || a.label.localeCompare(b.label))
		.slice(0, limit)
		.map((item) => ({
			label: item.label,
			value: item.std,
			color: TYPE_COLOR[dominantType(item.tally)],
			valueLabel: `±${item.std.toFixed(2)} · ${item.rated}`,
		}));
}

interface Bucket {
	label: string;
	count: number;
	avg: number | null;
}

function timeBuckets(items: Entry[]): Bucket[] {
	const dated = items.filter((e) => e.date !== null);
	if (dated.length === 0) {
		return [];
	}
	let min = Infinity;
	let max = -Infinity;
	for (const entry of dated) {
		const ms = entry.date as number;
		if (ms < min) {
			min = ms;
		}
		if (ms > max) {
			max = ms;
		}
	}
	const dMin = new Date(min);
	const dMax = new Date(max);
	const minIdx = dMin.getUTCFullYear() * 12 + dMin.getUTCMonth();
	const maxIdx = dMax.getUTCFullYear() * 12 + dMax.getUTCMonth();
	const monthly = maxIdx - minIdx <= 23;

	const map = new Map<number, Tally>();
	for (const entry of dated) {
		const d = new Date(entry.date as number);
		const key = monthly ? d.getUTCFullYear() * 12 + d.getUTCMonth() : d.getUTCFullYear();
		let tally = map.get(key);
		if (tally === undefined) {
			tally = { count: 0, sum: 0, sumSq: 0, rated: 0, types: new Map() };
			map.set(key, tally);
		}
		tally.count += 1;
		if (entry.rating !== null) {
			tally.sum += entry.rating;
			tally.rated += 1;
		}
	}

	const buckets: Bucket[] = [];
	const push = (key: number, label: string): void => {
		const tally = map.get(key);
		buckets.push({
			label,
			count: tally?.count ?? 0,
			avg: tally && tally.rated > 0 ? tally.sum / tally.rated : null,
		});
	};

	if (monthly) {
		for (let k = minIdx; k <= maxIdx; k += 1) {
			const year = Math.floor(k / 12);
			const month = k % 12;
			push(k, `${MONTHS[month]} '${String(year).slice(2)}`);
		}
	} else {
		for (let year = Math.floor(minIdx / 12); year <= Math.floor(maxIdx / 12); year += 1) {
			push(year, String(year));
		}
	}
	return buckets;
}

/* ------------------------------------------------------------------ *
 * Dashboard render
 * ------------------------------------------------------------------ */

function renderDashboard(items: Entry[]): string {
	for (const el of countElements) {
		el.textContent = `${formatNumber(items.length)} ${items.length === 1 ? "entry" : "entries"}`;
	}

	if (items.length === 0) {
		return `<section class="border border-solid border-accent-valencia/15 p-6"><p class="m-0 text-subtle-charcoal">Nothing matches these filters.</p></section>`;
	}

	const rated = items.filter((e) => e.rating !== null);
	const avgRating =
		rated.length === 0 ? null : rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length;
	const finished = items.filter((e) => e.status === "finished").length;
	const planned = items.length - finished;

	const studioTally = tallyBy(items, (e) => (e.studio === null ? [] : [e.studio]));
	const genreTally = tallyBy(items, (e) => e.genres);

	// Movie runtime facts only make sense when the whole filtered set is movies.
	const onlyMovies = items.every((e) => e.type === "movie");
	const movieRuntimes = items.flatMap((e) =>
		e.type === "movie" && e.runtime !== null && e.runtime > 0 ? [e.runtime] : [],
	);
	const filmMinutes = movieRuntimes.reduce((sum, m) => sum + m, 0);

	// ---- Facts — some appear only for certain filters ----
	const facts: string[] = [
		fact(formatNumber(items.length), "Entries", COLOR.charcoal),
		fact(formatNumber(finished), "Finished", COLOR.teal),
		fact(formatNumber(planned), "Planned", COLOR.orange),
		fact(
			avgRating === null
				? "—"
				: `${RATING_EMOJI[Math.round(avgRating)] ?? ""} ${avgRating.toFixed(2)}`,
			"Average rating",
			COLOR.accent,
		),
	];
	if (onlyMovies && movieRuntimes.length > 0) {
		facts.push(
			fact(formatMinutes(filmMinutes / movieRuntimes.length), "Avg. movie length", COLOR.violet),
		);
		facts.push(fact(formatNumber(Math.round(filmMinutes / 60)), "Film hours", COLOR.violet));
	}

	// ---- Rating distribution ---------------------------------------
	const ratingCounts = Array.from({ length: 6 }, () => 0);
	for (const entry of rated) {
		const r = entry.rating ?? 0;
		ratingCounts[r] = (ratingCounts[r] ?? 0) + 1;
	}
	const ratingBars: Bar[] = ratingCounts.map((count, r) => ({
		label: RATING_EMOJI[r] ?? "",
		title: RATING_LABEL[r] ?? "",
		sublabel: String(r),
		value: count,
		color: RATING_COLOR[r] ?? COLOR.accent,
	}));

	// ---- Type breakdown --------------------------------------------
	const typeOrder: EntryType[] = ["game", "movie", "show", "book"];
	const typeCounts = new Map<EntryType, number>();
	for (const entry of items) {
		typeCounts.set(entry.type, (typeCounts.get(entry.type) ?? 0) + 1);
	}
	const typeSlices: Slice[] = typeOrder.map((type) => ({
		label: TYPE_LABEL[type],
		value: typeCounts.get(type) ?? 0,
		color: TYPE_COLOR[type],
	}));

	// ---- Timeline ---------------------------------------------------
	const buckets = timeBuckets(items);
	const timelineBars: Bar[] = buckets.map((b) => ({
		label: b.label,
		value: b.count,
		color: COLOR.accent,
	}));
	const linePoints: LinePoint[] = buckets.map((b) => ({
		label: b.label,
		value: b.avg,
		count: b.count,
	}));

	// ---- Release decades -------------------------------------------
	const decadeTally = tallyBy(items, (e) =>
		e.year === null ? [] : [`${Math.floor(e.year / 10) * 10}s`],
	);
	const decadeBars: Bar[] = [...decadeTally.entries()]
		.sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
		.map(([label, tally]) => ({ label, value: tally.count, color: COLOR.violet }));

	// ---- Average rating by type (only meaningful with 2+ types) -----
	const typeRating = new Map<EntryType, { sum: number; n: number }>();
	for (const entry of items) {
		if (entry.rating === null) {
			continue;
		}
		const acc = typeRating.get(entry.type) ?? { sum: 0, n: 0 };
		acc.sum += entry.rating;
		acc.n += 1;
		typeRating.set(entry.type, acc);
	}
	const typeRatingBars: Bar[] = typeOrder
		.filter((type) => (typeRating.get(type)?.n ?? 0) > 0)
		.map((type) => {
			const acc = typeRating.get(type) ?? { sum: 0, n: 1 };
			return {
				label: TYPE_LABEL[type],
				value: Number((acc.sum / acc.n).toFixed(2)),
				color: TYPE_COLOR[type],
			};
		});
	const distinctTypes = new Set(items.map((e) => e.type)).size;

	// ---- Rating by release decade -----------------------------------
	const decadeRating = new Map<number, { sum: number; n: number }>();
	for (const entry of items) {
		if (entry.rating === null || entry.year === null) {
			continue;
		}
		const decade = Math.floor(entry.year / 10) * 10;
		const acc = decadeRating.get(decade) ?? { sum: 0, n: 0 };
		acc.sum += entry.rating;
		acc.n += 1;
		decadeRating.set(decade, acc);
	}
	const decadeRatingBars: Bar[] = [...decadeRating.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([decade, acc]) => ({
			label: `${decade}s`,
			value: Number((acc.sum / acc.n).toFixed(2)),
			color: COLOR.violet,
		}));

	// ---- Backlog age: finished year minus release year --------------
	const ageBuckets = [
		{ label: "Same yr", min: 0, max: 0 },
		{ label: "1 yr", min: 1, max: 1 },
		{ label: "2 yr", min: 2, max: 2 },
		{ label: "3–5", min: 3, max: 5 },
		{ label: "6–10", min: 6, max: 10 },
		{ label: "11–20", min: 11, max: 20 },
		{ label: "20+", min: 21, max: Infinity },
	];
	const ageCounts = ageBuckets.map(() => 0);
	let ageSum = 0;
	let ageN = 0;
	for (const entry of items) {
		if (entry.status !== "finished" || entry.date === null || entry.year === null) {
			continue;
		}
		const age = new Date(entry.date).getUTCFullYear() - entry.year;
		if (age < 0) {
			continue;
		}
		ageSum += age;
		ageN += 1;
		const idx = ageBuckets.findIndex((b) => age >= b.min && age <= b.max);
		if (idx >= 0) {
			ageCounts[idx] = (ageCounts[idx] ?? 0) + 1;
		}
	}
	const backlogBars: Bar[] = ageBuckets.map((b, i) => ({
		label: b.label,
		value: ageCounts[i] ?? 0,
		color: COLOR.orange,
	}));
	const backlogQualifier = ageN === 0 ? "" : `${(ageSum / ageN).toFixed(1)} yr avg`;

	// ---- Discovery rate: new studios/creators first tried per year --
	const studioFirstYear = new Map<string, number>();
	for (const entry of items) {
		if (entry.studio === null || entry.date === null) {
			continue;
		}
		const year = new Date(entry.date).getUTCFullYear();
		const prev = studioFirstYear.get(entry.studio);
		if (prev === undefined || year < prev) {
			studioFirstYear.set(entry.studio, year);
		}
	}
	const discoveryByYear = new Map<number, number>();
	for (const year of studioFirstYear.values()) {
		discoveryByYear.set(year, (discoveryByYear.get(year) ?? 0) + 1);
	}
	const discoveryYears = [...discoveryByYear.keys()];
	const discoveryBars: Bar[] = [];
	if (discoveryYears.length > 0) {
		const minYear = Math.min(...discoveryYears);
		const maxYear = Math.max(...discoveryYears);
		for (let y = minYear; y <= maxYear; y += 1) {
			discoveryBars.push({
				label: `'${String(y).slice(2)}`,
				title: String(y),
				value: discoveryByYear.get(y) ?? 0,
				color: COLOR.teal,
			});
		}
	}

	// ---- Assemble ---------------------------------------------------
	const charts: string[] = [
		card("Rating distribution", "", verticalBars(ratingBars, "entries")),
		card("By type", "", donut(typeSlices, "entries")),
		...(distinctTypes >= 2
			? [card("Average rating by type", "", verticalBars(typeRatingBars, "avg", 5))]
			: []),
		card("Activity over time", "", verticalBars(timelineBars, "entries")),
		card("Average rating over time", "", ratingLine(linePoints)),
		card("Activity heatmap", "", activityHeatmap(items)),
		card("Discovery rate", "new studios & creators / yr", verticalBars(discoveryBars, "new")),
		card("Backlog age", backlogQualifier, verticalBars(backlogBars, "entries")),
		card(
			"Studios and creators",
			`${formatNumber(studioTally.size)} total`,
			horizontalBars(topByCount(studioTally, 20), null),
		),
		cardControl(
			"Best-rated studios",
			thresholdInput("stats-studio-minrated", studioMinRated),
			horizontalBars(topByRating(studioTally, studioMinRated, 20), 5),
		),
		cardControl(
			"Most polarizing studios",
			thresholdInput("stats-studio-polar-minrated", studioPolarMinRated),
			horizontalBars(topByPolarizing(studioTally, studioPolarMinRated, 12), 2.5),
		),
		card("Top genres", "", horizontalBars(topByCount(genreTally, 12), null)),
		cardControl(
			"Best-rated genres",
			thresholdInput("stats-genre-minrated", genreMinRated),
			horizontalBars(topByRating(genreTally, genreMinRated, 12), 5),
		),
		cardControl(
			"Most polarizing genres",
			thresholdInput("stats-genre-polar-minrated", genrePolarMinRated),
			horizontalBars(topByPolarizing(genreTally, genrePolarMinRated, 12), 2.5),
		),
		card("Release decades", "", verticalBars(decadeBars, "entries")),
		card("Rating by decade", "", verticalBars(decadeRatingBars, "avg", 5)),
	];

	return [...facts, ...charts].join("");
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

interface Filters {
	search: string;
	type: string;
	status: string;
	rating: number | "";
	dateFrom: number | null;
	dateTo: number | null;
	collection: string;
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

function parseDate(value: string): number | null {
	if (value === "") {
		return null;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

function readFilters(): Filters {
	const ratingRaw = getInputValue(["#mobile-catalogue-ratings", "#catalogue-ratings"]);
	const statusRaw = getInputValue(["#mobile-catalogue-status", "#catalogue-status"]);
	const fromRaw = parseDate(getInputValue(["#mobile-catalogue-date-from", "#catalogue-date-from"]));
	const toRaw = parseDate(getInputValue(["#mobile-catalogue-date-to", "#catalogue-date-to"]));
	return {
		search: getInputValue(["#mobile-catalogue-search", "#catalogue-search"]).toLowerCase().trim(),
		type: getInputValue(["#mobile-catalogue-types", "#catalogue-types"]),
		status: statusRaw === "" ? "all" : statusRaw,
		rating: ratingRaw === "" ? "" : Number(ratingRaw),
		dateFrom: fromRaw,
		dateTo: toRaw === null ? null : toRaw + 86_400_000 - 1,
		collection: getInputValue(["#mobile-catalogue-collection", "#catalogue-collection"]),
	};
}

function matchesSearch(entry: Entry, search: string): boolean {
	if (search === "") {
		return true;
	}
	if (entry.title.toLowerCase().includes(search)) {
		return true;
	}
	if (entry.studio !== null && entry.studio.toLowerCase().includes(search)) {
		return true;
	}
	return entry.genres.some((genre) => genre.toLowerCase().includes(search));
}

function applyFilters(entries: Entry[], filters: Filters): Entry[] {
	const dateActive = filters.dateFrom !== null || filters.dateTo !== null;
	return entries.filter((entry) => {
		if (filters.type !== "" && entry.type !== filters.type) {
			return false;
		}
		if (filters.status !== "all" && entry.status !== filters.status) {
			return false;
		}
		if (filters.rating !== "" && entry.rating !== filters.rating) {
			return false;
		}
		if (filters.collection !== "" && !entry.collections.includes(filters.collection)) {
			return false;
		}
		if (dateActive) {
			if (entry.date === null) {
				return false;
			}
			if (filters.dateFrom !== null && entry.date < filters.dateFrom) {
				return false;
			}
			if (filters.dateTo !== null && entry.date > filters.dateTo) {
				return false;
			}
		}
		return matchesSearch(entry, filters.search);
	});
}

let allEntries: Entry[] = [];

// masonry.ts exposes this once its module runs; it re-flows every .masonry container.
function relayoutMasonry(): void {
	const fn = (window as unknown as { recalculateMasonry?: () => void }).recalculateMasonry;
	if (typeof fn === "function") {
		fn();
	}
}

function rebuild(): void {
	statsContent.innerHTML = renderDashboard(applyFilters(allEntries, readFilters()));
	relayoutMasonry();
	// Web fonts change text metrics after first paint; re-flow once they settle.
	void document.fonts.ready.then(relayoutMasonry);
}

/* ------------------------------------------------------------------ *
 * Data load — local-first with an IndexedDB cache keyed by content hash
 * ------------------------------------------------------------------ */

function buildCollectionRefs(
	entries: Entry[],
	index: Record<string, CollectionRef[]>,
): CollectionRef[] {
	const titles = new Map<string, string>();
	for (const refs of Object.values(index)) {
		for (const ref of refs) {
			titles.set(ref.slug, ref.title);
		}
	}
	const activity = new Map<string, number>();
	for (const entry of entries) {
		if (entry.date === null) {
			continue;
		}
		for (const slug of entry.collections) {
			activity.set(slug, Math.max(activity.get(slug) ?? -Infinity, entry.date));
		}
	}
	return [...titles.entries()]
		.map(([slug, title]) => ({ slug, title }))
		.sort(
			(a, b) =>
				(activity.get(b.slug) ?? -Infinity) - (activity.get(a.slug) ?? -Infinity) ||
				a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
		);
}

function errorUI(): void {
	statsContent.innerHTML =
		'<p class="text-center my-10">Failed to load stats. If refreshing doesn\'t help, reach me at <a class="underline" href="mailto:contact@erika.florist">contact@erika.florist</a>.</p>';
}

// The collection <select>s are server-rendered with just a placeholder; fill the rest here.
function populateCollectionSelect(refs: CollectionRef[]): void {
	const selects = document.querySelectorAll<HTMLSelectElement>(
		"#catalogue-collection, #mobile-catalogue-collection",
	);
	for (const select of selects) {
		const current = select.value;
		while (select.options.length > 1) {
			select.remove(1);
		}
		for (const ref of refs) {
			const option = document.createElement("option");
			option.value = ref.slug;
			option.textContent = ref.title;
			select.append(option);
		}
		select.value = current;
	}
}

function loadData(entries: Entry[], collections: CollectionRef[]): void {
	allEntries = entries;
	populateCollectionSelect(collections);
	rebuild();
}

function recordToEntry(record: CatalogueRecord, index: Record<string, CollectionRef[]>): Entry {
	const suffix = `-${record.type}`;
	const slug = record.id.endsWith(suffix) ? record.id.slice(0, -suffix.length) : record.id;
	return {
		title: record.title,
		type: record.type,
		rating: record.rating < 0 ? null : record.rating,
		status: record.status,
		date: record.date > 0 ? record.date : null,
		year: record.releaseYear,
		studio: record.author === "" ? null : record.author,
		genres: record.genres,
		runtime: record.runtime,
		collections: (index[`${record.type}/${slug}`] ?? []).map((ref) => ref.slug),
	};
}

loadCatalogueCache(
	latestHash,
	({ records, collections }) => {
		const entries = records.map((record) => recordToEntry(record, collections));
		loadData(entries, buildCollectionRefs(entries, collections));
	},
	errorUI,
);

/* ------------------------------------------------------------------ *
 * Wire the shared sidebar controls (mobile + desktop stay in sync)
 * ------------------------------------------------------------------ */

function syncPairedInputs(selectors: string[]): void {
	const elements = selectors.flatMap((selector) => [
		...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector),
	]);
	for (const el of elements) {
		el.addEventListener(
			el instanceof HTMLInputElement && el.type === "search" ? "input" : "change",
			() => {
				for (const other of elements) {
					if (other !== el) {
						other.value = el.value;
					}
				}
			},
		);
	}
}

const CONTROL_KEYS = ["search", "types", "status", "ratings", "date-from", "date-to", "collection"];
for (const key of CONTROL_KEYS) {
	syncPairedInputs([`#mobile-catalogue-${key}`, `#catalogue-${key}`]);
}

for (const key of CONTROL_KEYS) {
	for (const selector of [`#mobile-catalogue-${key}`, `#catalogue-${key}`]) {
		for (const el of document.querySelectorAll(selector)) {
			const eventName =
				el instanceof HTMLInputElement && (el.type === "search" || el.type === "date")
					? "input"
					: "change";
			el.addEventListener(eventName, rebuild);
		}
	}
}

// The best-rated cutoff inputs live inside the regenerated dashboard, so delegate off the
// stable container. `change` fires on blur / Enter / spinner click, not every keystroke.
statsContent.addEventListener("change", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLInputElement) || target.type !== "number") {
		return;
	}
	const value = Math.max(1, Math.floor(Number(target.value) || 1));
	if (target.id === "stats-studio-minrated") {
		studioMinRated = value;
	} else if (target.id === "stats-genre-minrated") {
		genreMinRated = value;
	} else if (target.id === "stats-studio-polar-minrated") {
		studioPolarMinRated = value;
	} else if (target.id === "stats-genre-polar-minrated") {
		genrePolarMinRated = value;
	} else {
		return;
	}
	rebuild();
});

export {};
