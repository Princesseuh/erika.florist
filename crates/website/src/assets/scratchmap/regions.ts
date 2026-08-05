import * as L from "leaflet";
import {
	UNITS,
	cellToBoundary,
	cellToLatLng,
	cellToParent,
	getHexagonAreaAvg,
	polygonToCells,
} from "h3-js";
import type { ScratchmapRegion } from "./db";
import { type Fog, type FogView, REVEAL, traceLayerPath } from "./fog";

// Warm, so the focused region separates from the violet fog.
const HIGHLIGHT_FILL = "rgba(249, 160, 63, 0.45)"; // orange-carrot
const HIGHLIGHT_OUTLINE = "#c73c2e"; // accent-valencia
const HIGHLIGHT_DIM = "rgba(10, 9, 8, 0.2)"; // charcoal
const HIGHLIGHT_PENDING = "rgba(249, 160, 63, 0.5)"; // orange-carrot

// Is a point inside a region? Ray casting; rings after the first in each polygon
// are holes. The same centre-in-outline rule xtask tiles with, so a badge bumped
// live agrees with what CI recomputes later.
const inRing = (lng: number, lat: number, ring: GeoJSON.Position[]) => {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i];
		const b = ring[j];
		if (!a || !b) continue;
		const [xi, yi] = a as [number, number];
		const [xj, yj] = b as [number, number];
		if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
};

// Numerator and denominator come from the same set, so a full region reads 100%.
interface Counts {
	explored: number;
	total: number;
	filled: number;
	filledTotal: number;
}
const share = (have: number, total: number) => (total > 0 ? (have / total) * 100 : 0);

// Small percentages get enough decimals to stay honest, without scientific
// notation.
const formatPercent = (p: number): string => {
	if (p <= 0) return "0%";
	if (p >= 10) return `${Math.round(p)}%`;
	if (p >= 1) return `${p.toFixed(1)}%`;
	const decimals = Math.min(9, Math.max(2, 1 - Math.floor(Math.log10(p))));
	return `${p.toFixed(decimals)}%`;
};

// Country outlines (Natural Earth) are pixel-accurate only up to zoom ~7. Past
// that, the OSM city level carries the real coastline.
const levelForZoom = (z: number): string => (z >= 13 ? "district" : z >= 8 ? "city" : "country");

const makeBadgeIcon = (name: string, percent: number) =>
	L.divIcon({
		className: "",
		iconSize: [0, 0],
		iconAnchor: [0, 0],
		// Opaque background: the badge must cover the base-map label under it.
		html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:#f7f7f7;border:1px solid rgba(10,9,8,0.12);border-radius:3px;padding:2px 6px;font:600 12px/1.1 system-ui,sans-serif;color:#0a0908;box-shadow:0 1px 2px rgba(0,0,0,0.2)">${name} · ${formatPercent(percent)}</span>`,
	});

// Keyed level:osm_id, so live mode can update labels.
interface RegionState extends Counts {
	name: string;
	marker: L.Marker;
	// The outline to test freshly-walked cells against, with its bounding box so
	// the common "nowhere near here" case costs four comparisons.
	rings: GeoJSON.Position[][][] | undefined;
	minLng: number;
	minLat: number;
	maxLng: number;
	maxLat: number;
}

const containsPoint = (state: RegionState, lng: number, lat: number) => {
	if (
		!state.rings ||
		lng < state.minLng ||
		lng > state.maxLng ||
		lat < state.minLat ||
		lat > state.maxLat
	) {
		return false;
	}
	return state.rings.some(
		(polygon) =>
			polygon[0] !== undefined &&
			inRing(lng, lat, polygon[0]) &&
			!polygon.slice(1).some((hole) => inRing(lng, lat, hole)),
	);
};

// Countries are excluded from the honeycomb: one holds tens of millions of res-10
// cells, and a honeycomb that size says nothing about a neighbourhood.
const UNEXPLORED_CAP = 12000;

// Each coarser resolution holds a seventh of the cells, so the res-10 count that
// already ships bounds every resolution without tiling anything to find out.
const cellEstimate = (state: RegionState, res: number) =>
	res >= 11 ? state.total : state.filledTotal / 7 ** (10 - res);

export type Regions = ReturnType<typeof createRegions>;

export function createRegions(
	map: L.Map,
	container: HTMLElement,
	regions: ScratchmapRegion[],
	fog: Fog,
) {
	const percentFor = (r: Counts) =>
		fog.revealMode() === "filled" ? share(r.filled, r.filledTotal) : share(r.explored, r.total);

	const badgeLayers: Record<string, L.LayerGroup> = {
		district: L.layerGroup(),
		city: L.layerGroup(),
		country: L.layerGroup(),
	};
	const regionStates = new Map<string, RegionState>();

	// Parents painted before live mode starts. A new cell only grows "filled" counts
	// when it opens a parent that is not in here.
	const filledParents = new Set(fog.walkedAt(REVEAL.filled));

	for (const region of regions) {
		const group = badgeLayers[region.level];
		if (!group) continue;

		// Same group as the badge, so both toggle together. Unexplored regions (the
		// world's other countries) draw dim: context, not content.
		if (region.geometry?.coordinates?.length) {
			L.geoJSON(region.geometry, {
				interactive: false,
				style:
					region.explored > 0
						? { color: "#2e2852", weight: 1.5, opacity: 0.85, fill: false }
						: { color: "#2e2852", weight: 1, opacity: 0.3, fill: false },
			}).addTo(group);
		}

		// No badge for a region with nothing explored; the outline still draws.
		if (region.explored <= 0) continue;

		const covered: Counts = {
			explored: region.explored,
			total: region.total,
			filled: region.filled,
			filledTotal: region.filled_total,
		};
		const marker = L.marker([region.lat, region.lon], {
			icon: makeBadgeIcon(region.name, percentFor(covered)),
			interactive: false,
			keyboard: false,
			pane: "badgePane",
		}).addTo(group);
		const rings = region.geometry?.coordinates;
		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;
		// The outer ring of each polygon bounds it; holes are inside by definition.
		for (const polygon of rings ?? []) {
			for (const position of polygon[0] ?? []) {
				const [lng, lat] = position as [number, number];
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
		}
		regionStates.set(`${region.level}:${region.osm_id}`, {
			name: region.name,
			...covered,
			marker,
			rings,
			minLng,
			minLat,
			maxLng,
			maxLat,
		});
	}

	let highlightKey: string | null = null;

	// Low zooms hold more badges than the screen has room for. Place greedily, most
	// explored first, and hide any badge that would overlap a placed one. Projected
	// positions do not change with panning, so recompute only on zoom or label change.
	const declutter = () => {
		const zoom = map.getZoom();
		const level = levelForZoom(zoom);
		const placed: { x: number; y: number; w: number; h: number }[] = [];
		const entries = [...regionStates.entries()]
			.filter(([key]) => key.startsWith(`${level}:`))
			// The focused region places first, so its badge is never the one dropped.
			.sort(
				(a, b) =>
					Number(b[0] === highlightKey) - Number(a[0] === highlightKey) ||
					b[1].explored - a[1].explored,
			);
		for (const [, state] of entries) {
			const point = map.project(state.marker.getLatLng(), zoom);
			const label = `${state.name} · ${formatPercent(percentFor(state))}`;
			// ~7.3 px per character of the 12 px font, plus padding.
			const w = label.length * 7.3 + 16;
			const h = 24;
			const box = { x: point.x - w / 2, y: point.y - h / 2, w, h };
			const collides = placed.some(
				(p) =>
					box.x < p.x + p.w + 4 &&
					p.x < box.x + box.w + 4 &&
					box.y < p.y + p.h + 4 &&
					p.y < box.y + box.h + 4,
			);
			state.marker.setOpacity(collides ? 0 : 1);
			if (!collides) placed.push(box);
		}
	};

	let activeLevel = "";
	const updateBadges = () => {
		const level = levelForZoom(map.getZoom());
		if (level !== activeLevel) {
			activeLevel = level;
			for (const [lvl, group] of Object.entries(badgeLayers)) {
				if (lvl === level) group.addTo(map);
				else group.remove();
			}
		}
		declutter();
	};

	// Boundaries are cached, so re-tracing the honeycomb does not recompute thousands
	// of H3 boundaries.
	interface Honeycomb {
		res: number;
		// Keyed by cell id, so freshly walked cells delete in place.
		hexes: Map<string, [number, number][]>;
	}

	const honeycombs = new Map<string, Honeycomb>();
	// Bumped when a walked cell leaves a honeycomb, so the traced path rebuilds.
	let honeycombVersion = 0;
	const honeycombFor = (key: string, state: RegionState, res: number): Honeycomb => {
		const cacheKey = `${key}:${res}`;
		let honeycomb = honeycombs.get(cacheKey);
		if (honeycomb) return honeycomb;

		const hexes = new Map<string, [number, number][]>();
		if (state.rings && !key.startsWith("country:") && cellEstimate(state, res) <= UNEXPLORED_CAP) {
			const walked = fog.walkedAt(res);
			for (const polygon of state.rings) {
				// h3-js reads GeoJSON winding directly, so the [lng, lat] rings pass through
				// untouched and holes stay holes. Same centre-in-outline rule CI tiles with.
				for (const cell of polygonToCells(polygon as number[][][], res, true)) {
					if (walked.has(cell)) continue;
					hexes.set(cell, cellToBoundary(cell));
				}
			}
		}
		honeycomb = { res, hexes };
		honeycombs.set(cacheKey, honeycomb);
		return honeycomb;
	};

	// A layer point is the projection at the current zoom minus Leaflet's pixel origin,
	// so a path traced in them survives everything but a zoom: a pan moves the pane, and
	// a view reset moves the origin by whole pixels. Both come back as a translation.
	interface Traced {
		path: Path2D;
		zoom: number;
		originX: number;
		originY: number;
	}
	const traced = (path: Path2D): Traced => {
		const origin = map.getPixelOrigin();
		return { path, zoom: map.getZoom(), originX: origin.x, originY: origin.y };
	};
	const stillProjected = (value: Traced) => value.zoom === map.getZoom();
	// Container coordinates for a path traced under an older pixel origin.
	const offsetFor = (value: Traced, pane: L.Point) => {
		const origin = map.getPixelOrigin();
		return { x: pane.x + value.originX - origin.x, y: pane.y + value.originY - origin.y };
	};

	// One region highlights at a time, so both path caches hold a single entry.
	let outlineCache: (Traced & { key: string }) | null = null;
	// Region rings are [lng, lat]; the reveal's are [lat, lng].
	const regionPath = (key: string, state: RegionState): Traced => {
		if (outlineCache?.key === key && stillProjected(outlineCache)) return outlineCache;
		const path = new Path2D();
		for (const polygon of state.rings ?? []) {
			for (const ring of polygon) {
				let first = true;
				for (const position of ring) {
					const [lng, lat] = position as [number, number];
					const point = map.latLngToLayerPoint([lat, lng]);
					if (first) {
						path.moveTo(point.x, point.y);
						first = false;
					} else {
						path.lineTo(point.x, point.y);
					}
				}
				path.closePath();
			}
		}
		outlineCache = { ...traced(path), key };
		return outlineCache;
	};

	// The whole honeycomb traces at once, off-screen cells included: UNEXPLORED_CAP
	// bounds it, and the canvas clips what falls outside far cheaper than a pan can
	// retrace it.
	interface PendingCache extends Traced {
		key: string;
		res: number;
		version: number;
		empty: boolean;
	}
	let pendingCache: PendingCache | null = null;

	const pendingPath = (key: string, state: RegionState, res: number): Traced | null => {
		// Under a few pixels the honeycomb reads as noise and costs a subpath per cell.
		// Cells of one resolution vary little enough in size for the average to decide.
		const metresPerPixel =
			(156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
		if (Math.sqrt(getHexagonAreaAvg(res, UNITS.m2)) / metresPerPixel < 4) return null;

		const cached = pendingCache;
		if (
			cached &&
			cached.key === key &&
			cached.res === res &&
			cached.version === honeycombVersion &&
			stillProjected(cached)
		) {
			return cached.empty ? null : cached;
		}

		const { hexes } = honeycombFor(key, state, res);
		const path = new Path2D();
		// Not clipped to the outline: a cell belongs to the region when its centre does,
		// so a border cell legitimately pokes out.
		for (const boundary of hexes.values()) traceLayerPath(map, path, boundary);
		pendingCache = {
			...traced(path),
			key,
			res,
			version: honeycombVersion,
			empty: hexes.size === 0,
		};
		return hexes.size === 0 ? null : pendingCache;
	};

	// Runs after the fog, so the tint lands on the cleared area instead of under it.
	const drawHighlight = (ctx: CanvasRenderingContext2D, cleared: Path2D[], view: FogView) => {
		const key = highlightKey;
		if (key === null) return;
		const state = regionStates.get(key);
		if (!state?.rings) return;
		const { sw, ne } = view;

		// Off-screen, the dim would veil the whole viewport with nothing lit under it.
		if (
			state.maxLat < sw.lat ||
			state.minLat > ne.lat ||
			state.maxLng < sw.lng ||
			state.minLng > ne.lng
		) {
			return;
		}

		const region = regionPath(key, state);
		ctx.globalCompositeOperation = "source-over";

		const pane = L.DomUtil.getPosition(map.getPanes().mapPane);
		const outline = offsetFor(region, pane);
		ctx.save();
		ctx.translate(outline.x, outline.y);

		// Even-odd throughout, so a region with a hole neither dims nor tints it.
		const outside = new Path2D();
		outside.rect(-outline.x, -outline.y, view.width, view.height);
		outside.addPath(region.path);
		ctx.fillStyle = HIGHLIGHT_DIM;
		ctx.fill(outside, "evenodd");

		ctx.save();
		ctx.clip(region.path, "evenodd");
		// The fog traces its cleared paths in container coordinates.
		ctx.translate(-outline.x, -outline.y);
		ctx.fillStyle = HIGHLIGHT_FILL;
		for (const path of cleared) ctx.fill(path, "evenodd");
		ctx.restore();

		// Before the honeycomb bails out: a fully walked region still needs its boundary.
		ctx.strokeStyle = HIGHLIGHT_OUTLINE;
		ctx.lineWidth = 2.5;
		ctx.stroke(region.path);
		ctx.restore();

		const pending = pendingPath(key, state, view.res);
		if (pending) {
			const honeycomb = offsetFor(pending, pane);
			ctx.save();
			ctx.translate(honeycomb.x, honeycomb.y);
			ctx.strokeStyle = HIGHLIGHT_PENDING;
			ctx.lineWidth = 1;
			ctx.stroke(pending.path);
			ctx.restore();
		}
	};

	const regionAt = (lat: number, lng: number): string | null => {
		const prefix = `${levelForZoom(map.getZoom())}:`;
		let best: string | null = null;
		let bestArea = Infinity;
		for (const [key, state] of regionStates) {
			if (!key.startsWith(prefix) || !containsPoint(state, lng, lat)) continue;
			// Outlines do nest at the same level; the tightest match is the one meant.
			const area = (state.maxLng - state.minLng) * (state.maxLat - state.minLat);
			if (area < bestArea) {
				bestArea = area;
				best = key;
			}
		}
		return best;
	};

	const HOVER_CAPABLE = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	let pointerLatLng: L.LatLng | null = null;
	let livePosition: L.LatLng | null = null;

	const refreshHighlight = () => {
		const aimed = HOVER_CAPABLE ? pointerLatLng : map.getCenter();
		const next =
			(aimed && regionAt(aimed.lat, aimed.lng)) ??
			(livePosition && regionAt(livePosition.lat, livePosition.lng)) ??
			null;
		if (next === highlightKey) return;
		highlightKey = next;
		if (HOVER_CAPABLE) container.style.cursor = next === null ? "" : "pointer";
		// The focused badge names what is lit up, so it has to survive decluttering.
		declutter();
		fog.scheduleDraw();
	};

	// Live mode's fallback aim: with no pointer, the highlight follows the walker.
	const setLivePosition = (latlng: L.LatLng | null) => {
		livePosition = latlng;
		refreshHighlight();
	};

	// The click point decides rather than the highlight, so a tap works on touch, where
	// the highlight tracks the centre instead.
	map.on("click", (event: L.LeafletMouseEvent) => {
		const key = regionAt(event.latlng.lat, event.latlng.lng);
		const state = key === null ? undefined : regionStates.get(key);
		if (!state?.rings) return;

		const bounds = L.latLngBounds([state.minLat, state.minLng], [state.maxLat, state.maxLng]);
		const framed = map.getBoundsZoom(bounds, false, L.point(24, 24));
		const current = map.getZoom();
		// Hold the current zoom when the region only just overflows the screen: half the
		// districts fit at zoom ~14, so framing every click ratchets in or jolts out.
		map.setView(bounds.getCenter(), framed > current || current - framed > 1 ? framed : current);
	});

	if (HOVER_CAPABLE) {
		map.on("mousemove", (event: L.LeafletMouseEvent) => {
			pointerLatLng = event.latlng;
			refreshHighlight();
		});
		map.on("mouseout", () => {
			pointerLatLng = null;
			refreshHighlight();
		});
	} else {
		// Touch pans fire move at event rate; one point-in-region probe per frame is
		// enough.
		let probePending = false;
		map.on("move", () => {
			if (probePending) return;
			probePending = true;
			requestAnimationFrame(() => {
				probePending = false;
				refreshHighlight();
			});
		});
	}
	// Zoom swaps the active level, so the same point can resolve to another region.
	map.on("zoomend", refreshHighlight);
	map.on("zoomend", updateBadges);

	// Attribute new cells the way CI does: parent cell → cached region → +1. Cells
	// with uncached parents wait for the next sync.
	const attributeToRegions = (cells: string[]) => {
		// Walked cells only ever leave a honeycomb, so cached ones shrink in place
		// instead of rebuilding with polygonToCells.
		for (const honeycomb of honeycombs.values()) {
			for (const cell of cells) {
				const removed = honeycomb.hexes.delete(
					honeycomb.res === REVEAL.precise ? cell : cellToParent(cell, honeycomb.res),
				);
				if (removed) honeycombVersion += 1;
			}
		}
		const dirty = new Set<string>();
		for (const cell of cells) {
			const parent = cellToParent(cell, REVEAL.filled);
			const opensParent = !filledParents.has(parent);
			if (opensParent) filledParents.add(parent);

			const [lat, lng] = cellToLatLng(cell);
			for (const [key, state] of regionStates) {
				if (!containsPoint(state, lng, lat)) continue;
				state.explored += 1;
				if (opensParent) state.filled += 1;
				dirty.add(key);
			}
		}
		for (const key of dirty) {
			const state = regionStates.get(key)!;
			state.marker.setIcon(makeBadgeIcon(state.name, percentFor(state)));
		}
		if (dirty.size > 0) declutter();
	};

	// The reveal toggle only changes which reading each label shows.
	const refreshBadges = () => {
		for (const state of regionStates.values()) {
			state.marker.setIcon(makeBadgeIcon(state.name, percentFor(state)));
		}
		declutter();
	};

	return {
		drawHighlight,
		refreshHighlight,
		updateBadges,
		refreshBadges,
		attributeToRegions,
		setLivePosition,
	};
}
