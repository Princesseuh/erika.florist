// Scratch map: fog of war over a slippy map. Fog covers the world; visited H3 cells
// are cut out of it. No hexagon grid is drawn on the fog itself, so a small visit
// does not read as one giant hexagon.
//
// Cells are stored at res 11 (~50 m). The map draws them at res 11 ("precise") or
// coarsened to res-10 parents ("filled"). This is a render choice only; the stored
// data never changes.

import * as L from "leaflet";
import { UNITS, cellArea, cellToLatLng, cellToParent, cellsToMultiPolygon, isValidCell } from "h3-js";
import { type ScratchmapCache, loadScratchmapCache } from "./scratchmap-db";

const el = document.getElementById("scratchmap-map");
const latestHash = el instanceof HTMLElement ? (el.dataset.latest ?? "") : "";

function init(data: ScratchmapCache): void {
	if (!el) return;
	// h3-js throws on invalid ids, so filter them. The Set lets live mode merge new
	// cells without duplicates.
	const visitedSet = new Set(data.cells.filter(isValidCell));
	let visited = [...visitedSet];

	const FOG_FILL = "rgba(82, 72, 156, 0.6)"; // violet-ultra
	const FOG_OUTLINE = "rgba(46, 40, 82, 0.65)"; // dark violet edge around the cleared area

	// "filled" coarsens each cell to its res-10 parent, so sparse walks read as areas.
	const REVEAL = { precise: 11, filled: 10 } as const;
	type RevealMode = keyof typeof REVEAL;

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

	// One union polygon of the reveal, with a bounding box for off-screen rejection.
	interface RevealPolygon {
		rings: [number, number][][];
		minLat: number;
		maxLat: number;
		minLng: number;
		maxLng: number;
	}

	const buildLevel = (res: number): RevealPolygon[] => {
		const drawn = new Set<string>();
		for (const cell of visited) drawn.add(res === 11 ? cell : cellToParent(cell, res));
		if (!drawn.size) return [];

		// Union the cells: shared edges dissolve, which leaves the silhouette with far
		// fewer vertices than the honeycomb.
		return cellsToMultiPolygon([...drawn], false).map((polygon) => {
			const rings = polygon as [number, number][][];
			let minLat = Infinity;
			let maxLat = -Infinity;
			let minLng = Infinity;
			let maxLng = -Infinity;
			// The outer ring bounds the holes too.
			for (const [lat, lng] of rings[0] ?? []) {
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
			}
			return { rings, minLat, maxLat, minLng, maxLng };
		});
	};

	// Built on first use and kept; live mode clears the cache.
	let levels = new Map<number, RevealPolygon[]>();
	const levelFor = (res: number): RevealPolygon[] => {
		let level = levels.get(res);
		if (!level) {
			level = buildLevel(res);
			levels.set(res, level);
		}
		return level;
	};
	const rebuildReveal = () => {
		levels = new Map();
		coverage.clear();
	};

	// Default "filled": res 11 alone reads as a thin dotted trail.
	const storedReveal = localStorage.getItem("scratchmap-reveal");
	let revealMode: RevealMode =
		storedReveal === "precise" || storedReveal === "filled" ? storedReveal : "filled";

	// Zoom animation stays off: the fog canvas draws in container coordinates and
	// cannot track Leaflet's mid-zoom CSS transform.
	const map = L.map(el, {
		zoomControl: false,
		minZoom: 2,
		maxZoom: 19,
		worldCopyJump: true,
		zoomAnimation: false,
	});
	L.control.zoom({ position: "topright" }).addTo(map);

	// Flex-centre, so the icon fits both the 26 px and the 30 px button size.
	const centerIcon = (button: HTMLElement) => {
		button.style.display = "flex";
		button.style.alignItems = "center";
		button.style.justifyContent = "center";
	};

	// L.Control.extend is dynamically typed, hence the `any`.
	const FullscreenControl = (L.Control as any).extend({
		onAdd() {
			const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			const button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
			button.href = "#";
			button.title = "Toggle fullscreen";
			button.setAttribute("role", "button");
			centerIcon(button);
			button.innerHTML =
				'<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>';
			L.DomEvent.on(button, "click", (event) => {
				L.DomEvent.stop(event);
				const frame = document.getElementById("scratchmap-frame");
				if (document.fullscreenElement) document.exitFullscreen();
				else frame?.requestFullscreen?.();
			});
			return bar;
		},
	});
	map.addControl(new FullscreenControl({ position: "topright" }));

	const hexIcon = (filled: boolean) =>
		`<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/></svg>`;
	const RevealControl = (L.Control as any).extend({
		onAdd() {
			const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			const button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
			button.href = "#";
			button.setAttribute("role", "button");
			centerIcon(button);
			const sync = () => {
				const filled = revealMode === "filled";
				button.innerHTML = hexIcon(filled);
				button.title = filled
					? "Reveal: filled — click for precise"
					: "Reveal: precise — click for filled";
			};
			sync();
			L.DomEvent.on(button, "click", (event) => {
				L.DomEvent.stop(event);
				revealMode = revealMode === "filled" ? "precise" : "filled";
				try {
					localStorage.setItem("scratchmap-reveal", revealMode);
				} catch {
					// Storage disabled: the toggle still works this session.
				}
				sync();
				// Badges and the stat show the active reveal.
				refreshBadges();
				updateStat();
				draw();
			});
			return bar;
		},
	});
	map.addControl(new RevealControl({ position: "topright" }));

	// The frame's normal height is viewport minus header; fullscreen needs 100%.
	document.addEventListener("fullscreenchange", () => {
		const frame = document.getElementById("scratchmap-frame");
		if (frame) frame.style.height = document.fullscreenElement === frame ? "100%" : "";
		map.invalidateSize();
	});

	const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	const formatArea = (m2: number) =>
		m2 >= 1_000_000 ? `${groupDigits(Math.round(m2 / 1_000_000))} km²` : `${groupDigits(m2)} m²`;
	const stat = document.createElement("div");
	stat.style.cssText =
		"position:absolute;left:12px;bottom:10px;z-index:1000;pointer-events:none;font-size:12px;font-variant-numeric:tabular-nums;color:#4d4d4d;text-shadow:0 1px 3px rgba(247,247,247,0.9)";
	// "precise" is ground stood on; "filled" is what the map clears. Areas are summed
	// per cell: H3 cell sizes vary enough that count times average runs ~10% high.
	const coverage = new Map<RevealMode, { count: number; m2: number }>();
	const coverageFor = (mode: RevealMode) => {
		let value = coverage.get(mode);
		if (!value) {
			const res = REVEAL[mode];
			const drawn =
				res === 11 ? visited : [...new Set(visited.map((cell) => cellToParent(cell, res)))];
			value = {
				count: drawn.length,
				m2: drawn.reduce((total, cell) => total + cellArea(cell, UNITS.m2), 0),
			};
			coverage.set(mode, value);
		}
		return value;
	};
	const updateStat = () => {
		const { count, m2 } = coverageFor(revealMode);
		stat.textContent =
			count === 0
				? "Nothing discovered yet"
				: `${count} hexagon${count === 1 ? "" : "s"} · ~${formatArea(Math.round(m2))}`;
	};
	updateStat();
	el.parentElement?.appendChild(stat);

	// Fixed pane order: fog 350 < labels 450 < badges 590 < live dot (default 600).
	// Badges avoid the default marker pane, which rewrites marker z-indexes during
	// pans. translateZ(0) pins each pane to its own compositing layer now: lazily
	// promoted layers can composite in paint order instead of z-index order, which
	// let outlines or labels flash above badges during pans (WebKit).
	const pane = (name: string, zIndex: string) => {
		const el = map.createPane(name);
		el.style.zIndex = zIndex;
		el.style.pointerEvents = "none";
		el.style.transform = "translateZ(0)";
		el.style.willChange = "transform";
		return el;
	};
	pane("fogPane", "350");
	pane("labelPane", "450");
	pane("badgePane", "590");
	// The outline SVG is the layer most prone to lazy promotion; pin it too.
	map.getPane("overlayPane")!.style.transform = "translateZ(0)";
	map.getPane("overlayPane")!.style.willChange = "transform";

	L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
		subdomains: "abcd",
		maxZoom: 19,
	}).addTo(map);

	L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
		pane: "labelPane",
		subdomains: "abcd",
		maxZoom: 19,
	}).addTo(map);

	// The fog canvas draws in container coordinates; each draw cancels the map pane's
	// pan offset to re-anchor it to the viewport.
	const canvas = document.createElement("canvas");
	canvas.style.position = "absolute";
	map.getPane("fogPane")!.appendChild(canvas);
	const ctx = canvas.getContext("2d");

	const draw = () => {
		if (!ctx) return;

		L.DomUtil.setPosition(canvas, L.DomUtil.getPosition(map.getPanes().mapPane).multiplyBy(-1));

		const size = map.getSize();
		ctx.clearRect(0, 0, size.x, size.y);

		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = FOG_FILL;
		ctx.fillRect(0, 0, size.x, size.y);

		// The same projected path serves the fill cut and the stroke.
		const bounds = map.getBounds().pad(0.15);
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		const level = levelFor(Math.min(REVEAL[revealMode], lodForZoom(map.getZoom())));

		ctx.strokeStyle = FOG_OUTLINE;
		ctx.lineWidth = 1.5;
		ctx.lineJoin = "round";

		for (const polygon of level) {
			// Off-screen rejection before touching any vertex.
			if (
				polygon.maxLat < sw.lat ||
				polygon.minLat > ne.lat ||
				polygon.maxLng < sw.lng ||
				polygon.minLng > ne.lng
			) {
				continue;
			}

			const path = new Path2D();
			for (const ring of polygon.rings) {
				let first = true;
				for (const [lat, lng] of ring) {
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

			// Even-odd: rings after the first punch holes.
			ctx.globalCompositeOperation = "destination-out";
			ctx.fill(path, "evenodd");
			ctx.globalCompositeOperation = "source-over";
			ctx.stroke(path);
		}
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

	// Coalesce `move` events into one draw per frame.
	let rafPending = false;
	const scheduleDraw = () => {
		if (rafPending) return;
		rafPending = true;
		requestAnimationFrame(() => {
			rafPending = false;
			draw();
		});
	};

	map.on("move", scheduleDraw);
	map.on("zoomend moveend viewreset", draw);
	map.on("resize", resize);

	const regions = data.regions;

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
	const percentFor = (r: Counts) =>
		revealMode === "filled" ? share(r.filled, r.filledTotal) : share(r.explored, r.total);

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

	const badgeLayers: Record<string, L.LayerGroup> = {
		district: L.layerGroup(),
		city: L.layerGroup(),
		country: L.layerGroup(),
	};

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
	const regionStates = new Map<string, RegionState>();

	// Parents painted before live mode starts. A new cell only grows "filled" counts
	// when it opens a parent that is not in here.
	const filledParents = new Set(visited.map((cell) => cellToParent(cell, REVEAL.filled)));

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

	// Attribute new cells the way CI does: parent cell → cached region → +1. Cells
	// with uncached parents wait for the next sync.
	const attributeToRegions = (cells: string[]) => {
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

	// Low zooms hold more badges than the screen has room for. Place greedily, most
	// explored first, and hide any badge that would overlap a placed one. Projected
	// positions do not change with panning, so recompute only on zoom or label change.
	const declutter = () => {
		const zoom = map.getZoom();
		const level = levelForZoom(zoom);
		const placed: { x: number; y: number; w: number; h: number }[] = [];
		const entries = [...regionStates.entries()]
			.filter(([key]) => key.startsWith(`${level}:`))
			.sort((a, b) => b[1].explored - a[1].explored);
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
	map.on("zoomend", updateBadges);

	if (visited.length > 0) {
		const points = visited.map((cell) => cellToLatLng(cell) as [number, number]);
		map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
	} else {
		map.setView([30, 10], 4);
	}

	// A "#lat,lng,zoom" hash positions the map. "#live" is handled below.
	const viewMatch = location.hash.match(/^#(-?[\d.]+),(-?[\d.]+),([\d.]+)$/);
	if (viewMatch) map.setView([+viewMatch[1], +viewMatch[2]], +viewMatch[3]);

	resize();
	updateBadges();

	// Live mode (logged in): poll the Worker for new cells. The endpoint is
	// cookie-gated, so the browser never holds the write token.
	const API_URL =
		window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
			? "http://localhost:8787"
			: "https://api.erika.florist";
	const POLL_MS = 10000;

	let livePoll: number | undefined;
	let liveOn = false;
	let syncLiveButton: (() => void) | undefined;

	// The viewer's own device position while live mode is on. Nothing starts before
	// live is enabled, so no location prompt appears otherwise.
	const LIVE_ICON = 48;
	const liveDotStyle = document.createElement("style");
	liveDotStyle.textContent = `
@keyframes scratchmap-live-pulse{0%{box-shadow:0 0 0 0 rgba(26,115,232,.5)}70%{box-shadow:0 0 0 14px rgba(26,115,232,0)}100%{box-shadow:0 0 0 0 rgba(26,115,232,0)}}
.scratchmap-live{position:relative;display:block;width:${LIVE_ICON}px;height:${LIVE_ICON}px}
.scratchmap-live-beam{position:absolute;inset:0;transform-origin:50% 50%;opacity:0;transition:opacity .25s ease,transform .2s linear}
.scratchmap-live-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1a73e8;border:2px solid #fff;animation:scratchmap-live-pulse 2s infinite}
@media (prefers-reduced-motion:reduce){.scratchmap-live-dot{animation:none}.scratchmap-live-beam{transition:opacity .25s ease}}`;
	document.head.appendChild(liveDotStyle);
	// Position dot plus heading cone. The cone stays hidden until a real heading
	// exists: a wrong cone is worse than none.
	const positionMarker = L.marker([0, 0], {
		icon: L.divIcon({
			className: "",
			iconSize: [LIVE_ICON, LIVE_ICON],
			iconAnchor: [LIVE_ICON / 2, LIVE_ICON / 2],
			html: `<span class="scratchmap-live"><svg class="scratchmap-live-beam" width="${LIVE_ICON}" height="${LIVE_ICON}" viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="scratchmap-beam" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1a73e8" stop-opacity=".6"/><stop offset="100%" stop-color="#1a73e8" stop-opacity="0"/></radialGradient></defs><path d="M24 24 L12 3.2 A24 24 0 0 1 36 3.2 Z" fill="url(#scratchmap-beam)"/></svg><span class="scratchmap-live-dot"></span></span>`,
		}),
		interactive: false,
		keyboard: false,
		zIndexOffset: 1000,
	});
	// GPS accuracy radius: shows whether a nearby tile is under you or only within
	// the fix error.
	const accuracyCircle = L.circle([0, 0], {
		radius: 0,
		interactive: false,
		color: "#1a73e8",
		weight: 1,
		opacity: 0.4,
		fillColor: "#1a73e8",
		fillOpacity: 0.12,
	});
	let positionShown = false;
	let geoWatchId: number | undefined;
	let geoCentred = false;

	// Degrees clockwise from true north. `beamAngle` unwraps across the 360° seam,
	// so the CSS rotation takes the short way round.
	let headingDeg: number | null = null;
	let beamAngle = 0;
	let compassSeen = false;
	const applyHeading = () => {
		const beam = positionMarker
			.getElement()
			?.querySelector<SVGElement>(".scratchmap-live-beam");
		if (!beam) return;
		if (headingDeg === null) {
			beam.style.opacity = "0";
			return;
		}
		beamAngle += (((headingDeg - beamAngle) % 360) + 540) % 360 - 180;
		beam.style.transform = `rotate(${beamAngle}deg)`;
		beam.style.opacity = "1";
	};
	const setHeading = (deg: number | null) => {
		if (deg !== null && !Number.isFinite(deg)) return;
		headingDeg = deg;
		applyHeading();
	};

	const onGeoPosition = (pos: GeolocationPosition) => {
		const { latitude, longitude, accuracy, heading } = pos.coords;
		positionMarker.setLatLng([latitude, longitude]);
		accuracyCircle.setLatLng([latitude, longitude]).setRadius(accuracy);
		if (!positionShown) {
			accuracyCircle.addTo(map);
			positionMarker.addTo(map);
			positionShown = true;
			// The element exists only after the marker is added; re-apply early headings.
			applyHeading();
		}
		// Geolocation `heading` is course over ground; the compass wins when present.
		if (!compassSeen) setHeading(heading === null ? null : heading);
		// Centre once, on the first fix; panning then sticks.
		if (!geoCentred) {
			map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
			geoCentred = true;
		}
	};
	// Safari reports a true-north heading. Elsewhere, absolute `alpha` counts
	// anticlockwise and gets flipped. Non-absolute events have an arbitrary reference
	// and are ignored.
	interface CompassEvent extends DeviceOrientationEvent {
		webkitCompassHeading?: number;
	}
	const onOrientation = (event: Event) => {
		const e = event as CompassEvent;
		const heading =
			typeof e.webkitCompassHeading === "number"
				? e.webkitCompassHeading
				: e.absolute && e.alpha !== null
					? (360 - e.alpha) % 360
					: null;
		if (heading === null) return;
		compassSeen = true;
		setHeading(heading);
	};
	const startOrientation = async () => {
		// iOS gates the compass behind a prompt that must come from a user gesture;
		// the live-toggle click is one.
		const DOE = window.DeviceOrientationEvent as
			| (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
			| undefined;
		if (typeof DOE?.requestPermission === "function") {
			try {
				if ((await DOE.requestPermission()) !== "granted") return;
			} catch {
				return; // Declined: continue without a cone.
			}
		}
		window.addEventListener("deviceorientationabsolute", onOrientation, true);
		window.addEventListener("deviceorientation", onOrientation, true);
	};
	const stopOrientation = () => {
		window.removeEventListener("deviceorientationabsolute", onOrientation, true);
		window.removeEventListener("deviceorientation", onOrientation, true);
		compassSeen = false;
		setHeading(null);
	};

	const startGeolocation = () => {
		if (geoWatchId !== undefined || !navigator.geolocation) return;
		geoCentred = false;
		geoWatchId = navigator.geolocation.watchPosition(onGeoPosition, () => {}, {
			enableHighAccuracy: true,
			maximumAge: 5000,
			timeout: 15000,
		});
		void startOrientation();
	};
	const stopGeolocation = () => {
		if (geoWatchId !== undefined) {
			navigator.geolocation.clearWatch(geoWatchId);
			geoWatchId = undefined;
		}
		stopOrientation();
		if (positionShown) {
			positionMarker.remove();
			accuracyCircle.remove();
			positionShown = false;
		}
	};

	// Merge fetched cells; redraw only when something is new.
	const applyLive = (cells: string[], last: string | null, recenter: boolean) => {
		const fresh: string[] = [];
		for (const cell of cells) {
			if (isValidCell(cell) && !visitedSet.has(cell)) {
				visitedSet.add(cell);
				fresh.push(cell);
			}
		}
		if (fresh.length > 0) {
			visited = [...visitedSet];
			rebuildReveal();
			updateStat();
			attributeToRegions(fresh);
			draw();
		}
		if (recenter && last && isValidCell(last)) {
			const [lat, lng] = cellToLatLng(last);
			map.setView([lat, lng], Math.max(map.getZoom(), 16));
		}
	};

	const fetchLive = async (recenter: boolean) => {
		try {
			const res = await fetch(`${API_URL}/scratchmap/live`, { credentials: "include" });
			if (!res.ok) return;
			const data = (await res.json()) as { cells?: string[]; last?: string | null };
			applyLive(data.cells ?? [], data.last ?? null, recenter);
		} catch {
			// Network error: keep the view, retry next tick.
		}
	};

	const startPolling = () => {
		if (livePoll === undefined) livePoll = window.setInterval(() => void fetchLive(false), POLL_MS);
	};
	const stopPolling = () => {
		if (livePoll !== undefined) {
			clearInterval(livePoll);
			livePoll = undefined;
		}
	};

	const setLive = (on: boolean) => {
		if (on === liveOn) return;
		liveOn = on;
		if (on) {
			startGeolocation();
			void fetchLive(true); // Immediate refresh, centred on the last-walked hex.
			startPolling();
		} else {
			stopPolling();
			stopGeolocation();
		}
		syncLiveButton?.();
	};

	// Pause polling while the tab is hidden, to save battery and data on a walk.
	document.addEventListener("visibilitychange", () => {
		if (!liveOn) return;
		if (document.hidden) stopPolling();
		else {
			void fetchLive(false);
			startPolling();
		}
	});

	const addLiveControl = () => {
		const LiveControl = (L.Control as any).extend({
			onAdd() {
				const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
				const button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
				button.href = "#";
				button.setAttribute("role", "button");
				centerIcon(button);
				syncLiveButton = () => {
					button.style.color = liveOn ? "#c0392b" : "";
					button.title = liveOn
						? "Live: following new cells — click to stop"
						: "Live: off — click to follow cells as you walk";
					button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48M7.76 16.24a6 6 0 0 1 0-8.48"/></svg>`;
				};
				syncLiveButton();
				L.DomEvent.on(button, "click", (event) => {
					L.DomEvent.stop(event);
					setLive(!liveOn);
				});
				return bar;
			},
		});
		map.addControl(new LiveControl({ position: "topright" }));
	};

	// Show the Live control only when logged in; "#live" auto-starts it.
	void (async () => {
		if (!document.cookie.split(";").some((c) => c.trim().startsWith("logged_in="))) return;
		try {
			const res = await fetch(`${API_URL}/auth`, { credentials: "include" });
			if (!res.ok) return;
			const auth = (await res.json()) as { authenticated?: boolean };
			if (auth.authenticated !== true) return;
			addLiveControl();
			if (location.hash === "#live") setLive(true);
		} catch {
			// Auth check failed: stay in static mode.
		}
	})();
}

if (el) {
	loadScratchmapCache(latestHash, init, () => init({ cells: [], regions: [] }));
}

export {};
