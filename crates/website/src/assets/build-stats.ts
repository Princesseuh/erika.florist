interface Build {
	date: string;
	commit: string;
	duration_ms: number;
	pages: number;
	run?: number;
}

interface Marker {
	date: string;
	label: string;
}

interface Stats {
	builds: Build[];
	markers: Marker[];
}

interface Point {
	t: number;
	value: number;
	build: Build;
}

// Kept in sync with prin.css so the chart matches the site.
const COLOR = {
	accent: "#c73c2e",
	violet: "#52489c",
	charcoal: "#0a0908",
	subtle: "#4d4d4d",
	sugar: "#f7f7f7",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAY = 86_400_000;
const MEDIAN_WINDOW = 7 * DAY;

const RUN_URL = "https://github.com/Princesseuh/erika.florist/actions/runs/";

const TICKS = [1000, 5000, 10_000, 30_000, 60_000, 300_000, 600_000, 1_800_000, 3_600_000];

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

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	const seconds = ms / 1000;
	if (seconds < 60) {
		return seconds < 10 && !Number.isInteger(seconds)
			? `${seconds.toFixed(1)}s`
			: `${Math.round(seconds)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function formatDate(t: number): string {
	const date = new Date(t);
	return `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const high = sorted[mid] ?? 0;
	return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? high) + high) / 2 : high;
}

// One value per day, so a busy deploy day can't outvote the quiet days around it.
function dailyMedian(points: Point[]): { t: number; value: number }[] {
	const byDay = new Map<number, number[]>();
	for (const point of points) {
		const day = Math.floor(point.t / DAY) * DAY;
		const bucket = byDay.get(day);
		if (bucket === undefined) {
			byDay.set(day, [point.value]);
		} else {
			bucket.push(point.value);
		}
	}
	return [...byDay]
		.map(([day, values]) => ({ t: day, value: median(values) }))
		.sort((a, b) => a.t - b.t);
}

// Centred, not trailing, so a step lines up with the change that caused it.
function rollingMedian(points: Point[]): { t: number; value: number }[] {
	const days = dailyMedian(points);
	const half = MEDIAN_WINDOW / 2;
	return days.map((day) => ({
		t: day.t,
		value: median(days.filter((o) => Math.abs(o.t - day.t) <= half).map((o) => o.value)),
	}));
}

function monthTicks(from: number, to: number): number[] {
	const ticks: number[] = [];
	const cursor = new Date(from);
	cursor.setUTCDate(1);
	cursor.setUTCHours(0, 0, 0, 0);
	cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	while (cursor.getTime() <= to) {
		ticks.push(cursor.getTime());
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return ticks;
}

function halo(size: number): string {
	return `paint-order="stroke" stroke="${COLOR.sugar}" stroke-width="${size}" stroke-linejoin="round"`;
}

function chart(stats: Stats, width: number): string {
	const points: Point[] = stats.builds
		.map((build) => ({ t: Date.parse(build.date), value: build.duration_ms, build }))
		.filter((point) => Number.isFinite(point.t) && point.value > 0)
		.sort((a, b) => a.t - b.t);

	if (points.length < 2) {
		return `<p class="text-sm text-subtle-charcoal py-8">Not enough builds recorded yet.</p>`;
	}

	const height = 320;
	const padL = 42;
	const padR = 14;
	const padT = 14;
	const padB = 28;
	const plotW = width - padL - padR;
	const plotH = height - padT - padB;

	const times = points.map((point) => point.t);
	const values = points.map((point) => point.value);
	const from = Math.min(...times);
	const to = Math.max(...times);
	const lo = Math.min(...values) * 0.7;
	const hi = Math.max(...values) * 1.5;
	const logLo = Math.log(lo);
	const logSpan = Math.log(hi) - logLo || 1;

	const x = (t: number): number => padL + ((t - from) / (to - from || 1)) * plotW;
	const y = (value: number): number => padT + plotH - ((Math.log(value) - logLo) / logSpan) * plotH;

	let body = "";

	for (const tick of TICKS) {
		if (tick < lo || tick > hi) {
			continue;
		}
		const ty = y(tick).toFixed(1);
		body += `<line x1="${padL}" y1="${ty}" x2="${width - padR}" y2="${ty}" stroke="${COLOR.charcoal}" stroke-opacity="0.1"/>`;
		body += `<text x="${padL - 6}" y="${ty}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="${COLOR.subtle}">${formatDuration(tick)}</text>`;
	}

	body += `<line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="${COLOR.charcoal}" stroke-opacity="0.25"/>`;

	for (const tick of monthTicks(from, to)) {
		const tx = x(tick).toFixed(1);
		const date = new Date(tick);
		body += `<text x="${tx}" y="${padT + plotH + 16}" text-anchor="middle" font-size="11" fill="${COLOR.subtle}">${MONTHS[date.getUTCMonth()] ?? ""}</text>`;
	}

	const markers = stats.markers
		.map((marker) => ({ t: Date.parse(marker.date), label: marker.label }))
		.filter((marker) => Number.isFinite(marker.t) && marker.t >= from && marker.t <= to);

	for (const marker of markers) {
		const mx = x(marker.t).toFixed(1);
		body += `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${padT + plotH}" stroke="${COLOR.violet}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity="0.5"/>`;
	}

	const median = rollingMedian(points);
	const path = median
		.map(
			(point, i) => `${i === 0 ? "M" : "L"}${x(point.t).toFixed(1)} ${y(point.value).toFixed(1)}`,
		)
		.join(" ");
	body += `<path d="${path}" fill="none" stroke="${COLOR.violet}" stroke-width="1.75" stroke-linejoin="round"/>`;

	for (const point of points) {
		const { commit, pages, run } = point.build;
		const title = `${formatDate(point.t)} · ${commit}\n${formatDuration(point.value)} · ${pages} pages${run === undefined ? "" : "\nClick for the build log"}`;
		// A transparent stroke widens the hit area without drawing a bigger dot.
		const dot = `<circle cx="${x(point.t).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="2.4" fill="${COLOR.accent}" fill-opacity="0.65" stroke="transparent" stroke-width="6"><title>${esc(title)}</title></circle>`;
		body +=
			run === undefined
				? dot
				: `<a href="${RUN_URL}${run}" target="_blank" rel="noreferrer" cursor="pointer">${dot}</a>`;
	}

	for (const marker of markers) {
		const lx = (x(marker.t) - 5).toFixed(1);
		const ly = padT + plotH - 6;
		body += `<text x="${lx}" y="${ly}" transform="rotate(-90 ${lx} ${ly})" font-size="11" fill="${COLOR.violet}" ${halo(3)}>${esc(marker.label)}</text>`;
	}

	const last = median.at(-1);
	if (last !== undefined) {
		body += `<text x="${(x(last.t) - 6).toFixed(1)}" y="${(y(last.value) - 9).toFixed(1)}" text-anchor="end" font-size="12" fill="${COLOR.violet}" ${halo(3)}>${esc(formatDuration(last.value))} median</text>`;
	}

	return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="'IBM Plex', sans-serif" style="max-width:100%;height:auto" role="img" aria-label="Build duration over time, log scale">${body}</svg>`;
}

function caption(stats: Stats): string {
	const last = stats.builds.at(-1);
	const first = stats.builds.at(0);
	if (last === undefined || first === undefined) {
		return "";
	}
	return `<p class="text-sm text-subtle-charcoal mt-2">${stats.builds.length} builds since ${esc(formatDate(Date.parse(first.date)))}. The latest took ${esc(formatDuration(last.duration_ms))} for ${last.pages} pages.</p>`;
}

function mount(target: HTMLElement, stats: Stats): void {
	let lastWidth = 0;
	const draw = (): void => {
		const width = Math.max(320, Math.round(target.clientWidth));
		if (width === lastWidth) {
			return;
		}
		lastWidth = width;
		target.innerHTML = chart(stats, width) + caption(stats);
	};

	draw();

	let frame = 0;
	const observer = new ResizeObserver(() => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(draw);
	});
	observer.observe(target);
}

async function load(target: HTMLElement): Promise<void> {
	try {
		const response = await fetch("/build-stats.json");
		if (!response.ok) {
			throw new Error(`${response.status}`);
		}
		mount(target, (await response.json()) as Stats);
	} catch {
		target.innerHTML = `<p class="text-sm text-subtle-charcoal py-8">Could not load build stats.</p>`;
	}
}

const container = document.querySelector<HTMLElement>("#build-chart");
if (container !== null) {
	void load(container);
}
