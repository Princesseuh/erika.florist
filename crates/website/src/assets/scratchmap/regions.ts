import * as L from "leaflet";
import { UNITS, cellArea, cellToBoundary, cellToLatLng, cellToParent, polygonToCells } from "h3-js";
import type { ScratchmapRegion } from "./db";
import { type Fog, type FogView, REVEAL, tracePath } from "./fog";

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
export const formatPercent = (p: number): string => {
	if (p <= 0) return "0%";
	if (p >= 10) return `${Math.round(p)}%`;
	if (p >= 1) return `${p.toFixed(1)}%`;
	const decimals = Math.min(9, Math.max(2, 1 - Math.floor(Math.log10(p))));
	return `${p.toFixed(decimals)}%`;
};

// Country outlines (Natural Earth) are pixel-accurate only up to zoom ~7. Past
// that, the OSM city level carries the real coastline.
const levelForZoom = (z: number): string => (z >= 13 ? "district" : z >= 8 ? "city" : "country");

// The inverse of levelForZoom, inside the map's own zoom range. Framing a region outside
// its band draws another level's outlines, so neither its badge nor its highlight shows.
const ZOOM_BAND: Record<string, [number, number]> = {
	city: [8, 12],
	country: [2, 7],
	district: [13, 19],
};

const makeBadgeIcon = (name: string, percent: number) =>
	L.divIcon({
		className: "",
		iconSize: [0, 0],
		iconAnchor: [0, 0],
		// Opaque background: the badge must cover the base-map label under it.
		html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:#f7f7f7;border:1px solid rgba(10,9,8,0.12);border-radius:3px;padding:2px 6px;font:600 12px/1.1 system-ui,sans-serif;color:#0a0908;box-shadow:0 1px 2px rgba(0,0,0,0.2)">${name} · ${formatPercent(percent)}</span>`,
	});

interface Bounds {
	minLng: number;
	minLat: number;
	maxLng: number;
	maxLat: number;
}

// The outer ring of each polygon bounds it; holes are inside by definition.
const boundsOf = (rings: GeoJSON.Position[][][] | undefined): Bounds => {
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	for (const polygon of rings ?? []) {
		for (const position of polygon[0] ?? []) {
			const [lng, lat] = position as [number, number];
			if (lng < minLng) minLng = lng;
			if (lng > maxLng) maxLng = lng;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
		}
	}
	return { minLng, minLat, maxLng, maxLat };
};

// An outline to test points against, with its bounding box so the common "nowhere near
// here" case costs four comparisons.
interface Outline extends Bounds {
	rings: GeoJSON.Position[][][] | undefined;
}

// Keyed level:osm_id, so live mode can update labels.
interface RegionState extends Counts, Outline {
	name: string;
	marker: L.Marker;
}

// What the search can offer: every country, walked or not, since the world's outlines all
// ship. A city or district only exists in the data once walked, so there is no more.
export interface SearchEntry extends Bounds {
	key: string;
	name: string;
	level: string;
	explored: number;
	// The badge anchor, which is the point the containing region is resolved from.
	lat: number;
	lon: number;
}

const containsPoint = (state: Outline, lng: number, lat: number) => {
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

	const searchEntries: SearchEntry[] = [];
	// A city with no district inside it is cloned onto the district layer under the same
	// osm_id. Both frame the same outline, so only the original earns a search hit.
	const cityIds = new Set(
		regions.filter((region) => region.level === "city").map((region) => region.osm_id),
	);
	// Outlines a search hit can sit inside. Countries come in walked or not: a city in a
	// country nobody walked still has to name it.
	const parentOutlines: (Outline & { level: string; name: string })[] = [];

	// Parents painted before live mode starts. A new cell only grows "filled" counts
	// when it opens a parent that is not in here.
	const filledParents = new Set(fog.walkedAt(REVEAL.filled));

	for (const region of regions) {
		const group = badgeLayers[region.level];
		if (!group) continue;

		const rings = region.geometry?.coordinates;
		const bounds = boundsOf(rings);
		const key = `${region.level}:${region.osm_id}`;

		// Same group as the badge, so both toggle together. Unexplored regions (the
		// world's other countries) draw dim: context, not content.
		if (rings?.length) {
			L.geoJSON(region.geometry, {
				interactive: false,
				style:
					region.explored > 0
						? { color: "#2e2852", weight: 1.5, opacity: 0.85, fill: false }
						: { color: "#2e2852", weight: 1, opacity: 0.3, fill: false },
			}).addTo(group);
		}

		if (rings?.length && (region.level === "country" || region.level === "city")) {
			parentOutlines.push({ level: region.level, name: region.name, rings, ...bounds });
		}

		if (
			rings?.length &&
			(region.level === "country" || region.explored > 0) &&
			!(region.level === "district" && cityIds.has(region.osm_id))
		) {
			searchEntries.push({
				key,
				name: region.name,
				level: region.level,
				explored: region.explored,
				lat: region.lat,
				lon: region.lon,
				...bounds,
			});
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
		regionStates.set(key, {
			name: region.name,
			...covered,
			...bounds,
			marker,
			rings,
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

	// Centres cull per frame; boundaries are cached too, so a pan does not
	// recompute thousands of H3 boundaries every frame.
	interface UnexploredHex {
		lat: number;
		lng: number;
		boundary: [number, number][];
	}
	interface Honeycomb {
		res: number;
		// Keyed by cell id, so freshly walked cells delete in place.
		hexes: Map<string, UnexploredHex>;
		// One sample cell, for the pixel-size bail-out.
		areaM2: number;
	}

	const honeycombs = new Map<string, Honeycomb>();
	const honeycombFor = (key: string, state: RegionState, res: number): Honeycomb => {
		const cacheKey = `${key}:${res}`;
		let honeycomb = honeycombs.get(cacheKey);
		if (honeycomb) return honeycomb;

		const hexes = new Map<string, UnexploredHex>();
		let areaM2 = 0;
		if (state.rings && !key.startsWith("country:") && cellEstimate(state, res) <= UNEXPLORED_CAP) {
			const walked = fog.walkedAt(res);
			for (const polygon of state.rings) {
				// h3-js reads GeoJSON winding directly, so the [lng, lat] rings pass through
				// untouched and holes stay holes. Same centre-in-outline rule CI tiles with.
				for (const cell of polygonToCells(polygon as number[][][], res, true)) {
					if (walked.has(cell)) continue;
					if (areaM2 === 0) areaM2 = cellArea(cell, UNITS.m2);
					const [lat, lng] = cellToLatLng(cell);
					hexes.set(cell, { lat, lng, boundary: cellToBoundary(cell) });
				}
			}
		}
		honeycomb = { res, hexes, areaM2 };
		honeycombs.set(cacheKey, honeycomb);
		return honeycomb;
	};

	// Region rings are [lng, lat]; the reveal's are [lat, lng].
	const regionPath = (state: RegionState): Path2D => {
		const path = new Path2D();
		for (const polygon of state.rings ?? []) {
			for (const ring of polygon) {
				let first = true;
				for (const position of ring) {
					const [lng, lat] = position as [number, number];
					const point = map.latLngToContainerPoint([lat, lng]);
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
		return path;
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

		const region = regionPath(state);
		ctx.globalCompositeOperation = "source-over";

		// Even-odd throughout, so a region with a hole neither dims nor tints it.
		const outside = new Path2D();
		outside.rect(0, 0, view.width, view.height);
		outside.addPath(region);
		ctx.fillStyle = HIGHLIGHT_DIM;
		ctx.fill(outside, "evenodd");

		ctx.save();
		ctx.clip(region, "evenodd");
		ctx.fillStyle = HIGHLIGHT_FILL;
		for (const path of cleared) ctx.fill(path, "evenodd");
		ctx.restore();

		// Before the honeycomb bails out: a fully walked region still needs its boundary.
		ctx.strokeStyle = HIGHLIGHT_OUTLINE;
		ctx.lineWidth = 2.5;
		ctx.stroke(region);

		// Not clipped to the outline: a cell belongs to the region when its centre does,
		// so a border cell legitimately pokes out.
		const { hexes, areaM2 } = honeycombFor(key, state, view.res);
		if (hexes.size === 0) return;

		// Under a few pixels the honeycomb reads as noise and costs a path per cell.
		const metresPerPixel =
			(156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
		if (Math.sqrt(areaM2) / metresPerPixel < 4) return;

		const pending = new Path2D();
		let drawn = 0;
		for (const { lat, lng, boundary } of hexes.values()) {
			if (lat < sw.lat || lat > ne.lat || lng < sw.lng || lng > ne.lng) continue;
			tracePath(map, pending, boundary);
			drawn += 1;
		}
		if (drawn > 0) {
			ctx.strokeStyle = HIGHLIGHT_PENDING;
			ctx.lineWidth = 1;
			ctx.stroke(pending);
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
	// A searched region, lit until the pointer or a drag takes the map back. It ranks
	// under the pointer so hovering elsewhere still wins, and over the live dot because
	// a search is the more deliberate of the two.
	let pinnedKey: string | null = null;

	const refreshHighlight = () => {
		// The pin holds only while its own level is the one drawn. Zooming away from a
		// searched region would otherwise keep it lit from a layer no longer on the map.
		const pinned =
			pinnedKey !== null && pinnedKey.startsWith(`${levelForZoom(map.getZoom())}:`)
				? pinnedKey
				: null;

		// Deliberate aim first: the pointer, then the region just searched. A touch viewer
		// has neither, so the map centre stands in — but under the pin, since framing
		// centres a bounding box, and for a bent or scattered outline that point lands
		// outside the region and often inside a walked neighbour.
		let next: string | null = null;
		if (HOVER_CAPABLE && pointerLatLng) next = regionAt(pointerLatLng.lat, pointerLatLng.lng);
		next ??= pinned;
		if (next === null && !HOVER_CAPABLE) {
			const centre = map.getCenter();
			next = regionAt(centre.lat, centre.lng);
		}
		if (next === null && livePosition) next = regionAt(livePosition.lat, livePosition.lng);
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
			pinnedKey = null;
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
	// Only a real gesture drags; setView never does. That makes it the one signal that
	// the viewer moved on from the searched region.
	map.on("dragstart", () => {
		if (pinnedKey === null) return;
		pinnedKey = null;
		refreshHighlight();
	});

	// Frame a search hit and light it up. The zoom clamps into the region's own band, so
	// what lands on screen is the layer the result came from.
	const focusRegion = (entry: SearchEntry) => {
		// The pointer rests on the search panel, so its last position over the map must not
		// outrank the result. Only a walked region has an outline to light up.
		pointerLatLng = null;
		pinnedKey = regionStates.has(entry.key) ? entry.key : null;

		const bounds = L.latLngBounds([entry.minLat, entry.minLng], [entry.maxLat, entry.maxLng]);
		const [floor, ceiling] = ZOOM_BAND[entry.level] ?? [map.getMinZoom(), map.getMaxZoom()];
		const framed = map.getBoundsZoom(bounds, false, L.point(24, 24));
		map.setView(bounds.getCenter(), Math.min(Math.max(framed, floor), ceiling));
		refreshHighlight();
	};

	// Null for a country nobody has walked: it has an outline but no percentage.
	const regionPercent = (key: string): number | null => {
		const state = regionStates.get(key);
		return state ? percentFor(state) : null;
	};

	// Same-name places sit worlds apart: Montréal is a Québec city and an Aude commune
	// both. The region around one tells them apart. Nearest first, since the tighter
	// container is the more telling: a district names its city, and falls back to the
	// country only where no city holds it, as with the Puerto Rican barrios.
	const CONTEXT_LEVELS: Record<string, string[]> = {
		city: ["country"],
		country: [],
		district: ["city", "country"],
	};

	// Resolved on demand: only the handful of results on screen ever need it.
	const contexts = new Map<string, string | null>();
	const regionContext = (entry: SearchEntry): string | null => {
		const cached = contexts.get(entry.key);
		if (cached !== undefined) return cached;

		let found: string | null = null;
		for (const wanted of CONTEXT_LEVELS[entry.level] ?? []) {
			let bestArea = Infinity;
			for (const outline of parentOutlines) {
				// The tightest container says the most. A container repeating the name is kept:
				// "Luxembourg · Luxembourg" still says which of the two it is.
				if (outline.level !== wanted) continue;
				if (!containsPoint(outline, entry.lon, entry.lat)) continue;
				const area = (outline.maxLng - outline.minLng) * (outline.maxLat - outline.minLat);
				if (area < bestArea) {
					bestArea = area;
					found = outline.name;
				}
			}
			// Coastal outlines are coarse enough that a centroid can fall just outside the
			// country holding it. No name beats a wrong one, so nothing is guessed.
			if (found !== null) break;
		}
		contexts.set(entry.key, found);
		return found;
	};

	// Attribute new cells the way CI does: parent cell → cached region → +1. Cells
	// with uncached parents wait for the next sync.
	const attributeToRegions = (cells: string[]) => {
		// Walked cells only ever leave a honeycomb, so cached ones shrink in place
		// instead of rebuilding with polygonToCells.
		for (const honeycomb of honeycombs.values()) {
			for (const cell of cells) {
				honeycomb.hexes.delete(
					honeycomb.res === REVEAL.precise ? cell : cellToParent(cell, honeycomb.res),
				);
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
		searchEntries,
		focusRegion,
		regionPercent,
		regionContext,
	};
}
