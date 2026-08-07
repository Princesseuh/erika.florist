import * as L from "leaflet";
import {
	UNITS,
	cellArea,
	cellToLatLng,
	cellToParent,
	cellsToMultiPolygon,
	isValidCell,
} from "h3-js";

// Cells are stored at res 11 (~50 m); "filled" coarsens each to its res-10 parent,
// so sparse walks read as areas. A render choice only; the stored data never changes.
export const REVEAL = { precise: 11, filled: 10 } as const;
export type RevealMode = keyof typeof REVEAL;

export interface FogView {
	res: number;
	sw: L.LatLng;
	ne: L.LatLng;
	width: number;
	height: number;
	cleared: Placement & { path: Path2D };
}
export type FogOverlay = (ctx: CanvasRenderingContext2D, view: FogView) => void;
export type Fog = ReturnType<typeof createFog>;

// Web Mercator scales exactly with zoom: projecting at zoom z is projecting at zoom 0
// times 2^z. So one traced path serves every zoom, and the draw scales it into place
// rather than re-projecting a vertex. Vertices stay unrounded, which is what makes
// the scaled positions come out right at any zoom.
export interface Traced {
	path: Path2D;
	zoom: number;
	originX: number;
	originY: number;
}

export interface Placement {
	scale: number;
	x: number;
	y: number;
}

export const traceAnchor = (map: L.Map, path: Path2D): Traced => {
	const origin = map.getPixelOrigin();
	return { path, zoom: map.getZoom(), originX: origin.x, originY: origin.y };
};

// Where a traced path sits now: coordinates are relative to the pixel origin of the
// zoom it was traced at, so the scale carries them to the current one.
export const placeFor = (map: L.Map, value: Traced, pane: L.Point): Placement => {
	const scale = 2 ** (map.getZoom() - value.zoom);
	const origin = map.getPixelOrigin();
	return {
		scale,
		x: pane.x + value.originX * scale - origin.x,
		y: pane.y + value.originY * scale - origin.y,
	};
};

// Rings arrive [lat, lng]; the projection is the current zoom's, less the origin the
// path is stamped with.
export const traceRing = (
	map: L.Map,
	path: Path2D,
	ring: Iterable<[number, number]>,
	originX: number,
	originY: number,
): void => {
	let first = true;
	for (const [lat, lng] of ring) {
		const point = map.project([lat, lng]);
		const x = point.x - originX;
		const y = point.y - originY;
		if (first) {
			path.moveTo(x, y);
			first = false;
		} else {
			path.lineTo(x, y);
		}
	}
	path.closePath();
};

const FOG_FILL = "rgba(82, 72, 156, 0.6)"; // violet-ultra
const FOG_OUTLINE = "rgba(46, 40, 82, 0.65)"; // dark violet edge around the cleared area

// Zoomed out, a res-11 hexagon is far under one pixel; draw coarser parents
// instead. Each step keeps hexagons within ~3 px at latitude 58° (the north end
// of the data), so the coarsening stays invisible. Too coarse shows as blobs; too
// fine only costs draw time.
const lodForZoom = (zoom: number): number => {
	if (zoom < 2) return 3;
	if (zoom < 3) return 4;
	if (zoom < 4) return 5;
	if (zoom < 6) return 6;
	if (zoom < 7) return 7;
	if (zoom < 9) return 8;
	if (zoom < 10) return 9;
	if (zoom < 12) return 10;
	return 11;
};

const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const formatArea = (m2: number) =>
	m2 >= 1_000_000 ? `${groupDigits(Math.round(m2 / 1_000_000))} km²` : `${groupDigits(m2)} m²`;

export function createFog(map: L.Map, container: HTMLElement, cells: string[]) {
	// h3-js throws on invalid ids, so filter them. The Set lets live mode merge new
	// cells without duplicates.
	const visited = new Set(cells.filter(isValidCell));

	// The fog, the stat, and the regions' honeycomb all consume these same sets.
	const visitedByRes = new Map<number, Set<string>>();
	const walkedAt = (res: number): ReadonlySet<string> => {
		if (res === REVEAL.precise) return visited;
		let set = visitedByRes.get(res);
		if (!set) {
			set = new Set();
			for (const cell of visited) set.add(cellToParent(cell, res));
			visitedByRes.set(res, set);
		}
		return set;
	};

	// Cell centres for the viewport filter, appended in place when live cells land.
	interface CellCentre {
		cell: string;
		lat: number;
		lng: number;
	}
	const centresByRes = new Map<number, CellCentre[]>();
	const centresAt = (res: number): CellCentre[] => {
		let centres = centresByRes.get(res);
		if (!centres) {
			centres = [];
			for (const cell of walkedAt(res)) {
				const [lat, lng] = cellToLatLng(cell);
				centres.push({ cell, lat, lng });
			}
			centresByRes.set(res, centres);
		}
		return centres;
	};

	const buildLevel = (res: number, scope: L.LatLngBounds | null): Traced => {
		let drawn: string[];
		if (scope) {
			const south = scope.getSouth();
			const north = scope.getNorth();
			const west = scope.getWest();
			const east = scope.getEast();
			drawn = [];
			for (const { cell, lat, lng } of centresAt(res)) {
				if (lat >= south && lat <= north && lng >= west && lng <= east) drawn.push(cell);
			}
		} else {
			drawn = [...walkedAt(res)];
		}

		const path = new Path2D();
		if (drawn.length) {
			const origin = map.getPixelOrigin();
			// Union the cells: shared edges dissolve, which leaves the silhouette with far
			// fewer vertices than the honeycomb.
			for (const polygon of cellsToMultiPolygon(drawn, false)) {
				for (const ring of polygon) {
					traceRing(map, path, ring as [number, number][], origin.x, origin.y);
				}
			}
		}
		return traceAnchor(map, path);
	};

	// Res 10 and 11 unions cover tens of thousands of cells (~1 s on a phone), so
	// they build scoped to the padded view and rebuild on a pan past the pad. They
	// are only drawn zoomed in, where the view holds few cells and the union is
	// cheap. Coarser levels are small; they build once, globally.
	const VIEWPORT_RES = 10;
	interface Level {
		traced: Traced;
		scope: L.LatLngBounds | null;
	}
	const levels = new Map<number, Level>();
	const levelFor = (res: number, view: L.LatLngBounds): Traced => {
		const cached = levels.get(res);
		if (cached && (cached.scope === null || cached.scope.contains(view))) return cached.traced;
		const scope = res >= VIEWPORT_RES ? view.pad(1.5) : null;
		const level = { traced: buildLevel(res, scope), scope };
		levels.set(res, level);
		return level.traced;
	};

	// Default "filled": res 11 alone reads as a thin dotted trail.
	const storedReveal = localStorage.getItem("scratchmap-reveal");
	let mode: RevealMode =
		storedReveal === "precise" || storedReveal === "filled" ? storedReveal : "filled";

	// "precise" is ground stood on; "filled" is what the map clears. Areas are summed
	// per cell: H3 cell sizes vary enough that count times average runs ~10% high.
	const coverage = new Map<RevealMode, { count: number; m2: number }>();
	const coverageFor = (forMode: RevealMode) => {
		let value = coverage.get(forMode);
		if (!value) {
			const drawn = walkedAt(REVEAL[forMode]);
			let m2 = 0;
			for (const cell of drawn) m2 += cellArea(cell, UNITS.m2);
			value = { count: drawn.size, m2 };
			coverage.set(forMode, value);
		}
		return value;
	};

	const stat = document.createElement("div");
	stat.style.cssText =
		"position:absolute;left:12px;bottom:10px;z-index:1000;pointer-events:none;font-size:12px;font-variant-numeric:tabular-nums;color:#4d4d4d;text-shadow:0 1px 3px rgba(247,247,247,0.9)";
	const updateStat = () => {
		const { count, m2 } = coverageFor(mode);
		stat.textContent =
			count === 0
				? "Nothing discovered yet"
				: `${count} hexagon${count === 1 ? "" : "s"} · ~${formatArea(Math.round(m2))}`;
	};
	updateStat();
	container.parentElement?.appendChild(stat);

	// The fog canvas draws in container coordinates; each draw cancels the map pane's
	// pan offset to re-anchor it to the viewport.
	const canvas = document.createElement("canvas");
	canvas.style.position = "absolute";
	map.getPane("fogPane")!.appendChild(canvas);
	const ctx = canvas.getContext("2d");

	// Runs after the fog paints, so the region highlight lands on top of it.
	let overlay: FogOverlay | undefined;

	const draw = () => {
		if (!ctx) return;

		const pane = L.DomUtil.getPosition(map.getPanes().mapPane);
		L.DomUtil.setPosition(canvas, pane.multiplyBy(-1));

		const size = map.getSize();
		ctx.clearRect(0, 0, size.x, size.y);

		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = FOG_FILL;
		ctx.fillRect(0, 0, size.x, size.y);

		const bounds = map.getBounds().pad(0.15);
		const res = Math.min(REVEAL[mode], lodForZoom(map.getZoom()));
		const reveal = levelFor(res, bounds);
		const place = placeFor(map, reveal, pane);

		ctx.save();
		ctx.translate(place.x, place.y);
		ctx.scale(place.scale, place.scale);
		// Even-odd: rings after the first of each polygon punch holes.
		ctx.globalCompositeOperation = "destination-out";
		ctx.fill(reveal.path, "evenodd");
		ctx.globalCompositeOperation = "source-over";
		ctx.strokeStyle = FOG_OUTLINE;
		ctx.lineJoin = "round";
		ctx.lineWidth = 1.5 / place.scale;
		ctx.stroke(reveal.path);
		ctx.restore();

		overlay?.(ctx, {
			res,
			sw: bounds.getSouthWest(),
			ne: bounds.getNorthEast(),
			width: size.x,
			height: size.y,
			cleared: { path: reveal.path, ...place },
		});
	};

	const resize = () => {
		if (!ctx) return;
		const size = map.getSize();
		const dpr = window.devicePixelRatio || 1;
		canvas.width = size.x * dpr;
		canvas.height = size.y * dpr;
		canvas.style.width = `${size.x}px`;
		canvas.style.height = `${size.y}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		draw();
	};

	// Coalesce map events into one draw per frame; rAF still runs before the browser
	// paints, so no stale frame shows.
	let rafPending = false;
	const scheduleDraw = () => {
		if (rafPending) return;
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			draw();
		});
	};

	map.on("move zoomend moveend viewreset", scheduleDraw);
	map.on("resize", resize);

	// Live merges land every poll on a walk, so every built cache grows in place;
	// only the union polygons rebuild, and those come back viewport-scoped. Caches
	// not built yet derive from `visited` later, which is already updated.
	const addCells = (fresh: string[]): string[] => {
		const added = fresh.filter((cell) => isValidCell(cell) && !visited.has(cell));
		if (added.length === 0) return added;
		for (const cell of added) visited.add(cell);

		const newDrawn = new Map<number, string[]>([[REVEAL.precise, added]]);
		for (const [res, set] of visitedByRes) {
			const drawn: string[] = [];
			for (const cell of added) {
				const parent = cellToParent(cell, res);
				if (!set.has(parent)) {
					set.add(parent);
					drawn.push(parent);
				}
			}
			newDrawn.set(res, drawn);
		}
		for (const [res, centres] of centresByRes) {
			for (const cell of newDrawn.get(res) ?? []) {
				const [lat, lng] = cellToLatLng(cell);
				centres.push({ cell, lat, lng });
			}
		}
		for (const [forMode, value] of coverage) {
			const drawn = newDrawn.get(REVEAL[forMode]);
			if (!drawn) {
				coverage.delete(forMode);
				continue;
			}
			value.count += drawn.length;
			for (const cell of drawn) value.m2 += cellArea(cell, UNITS.m2);
		}
		levels.clear();
		updateStat();
		return added;
	};

	const toggleReveal = () => {
		mode = mode === "filled" ? "precise" : "filled";
		try {
			localStorage.setItem("scratchmap-reveal", mode);
		} catch {
			// Storage disabled: the toggle still works this session.
		}
		updateStat();
		scheduleDraw();
	};

	return {
		visited: visited as ReadonlySet<string>,
		walkedAt,
		revealMode: () => mode,
		toggleReveal,
		addCells,
		scheduleDraw,
		resize,
		setOverlay: (fn: FogOverlay) => {
			overlay = fn;
		},
	};
}
