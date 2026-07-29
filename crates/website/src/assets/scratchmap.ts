// Scratch map: a fog-of-war over a real OpenStreetMap slippy map (CARTO Positron).
// The whole world is covered by a solid translucent fog; the H3 cells you've visited
// are cut out of it, revealing the map beneath. The ONLY hexagon shapes visible are
// the jagged edges of what you've cleared — there is no hex grid drawn on the fog
// (that's what makes a small visit never read as "one big hexagon").
//
// Layering (bottom → top): base map without labels → fog canvas → labels, so place
// and street names stay readable on top of the fog. The fog is a single canvas held
// in its own pane, re-anchored to the viewport each frame so panning stays smooth.
//
// Cells are stored at H3 res-11 (~50 m). The map can *draw* the cleared area either
// at that true resolution ("precise") or coarsened up to res-10 parents ("filled",
// the default), so a walk reads as an area instead of a thin dotted trail. This is
// purely a render choice — the stored data is untouched, so the top-right toggle is
// lossless and reversible. Leaflet + h3-js are bundled from npm.

import * as L from "leaflet";
import { UNITS, cellArea, cellToLatLng, cellToParent, cellsToMultiPolygon, isValidCell } from "h3-js";

const el = document.getElementById("scratchmap-map");
const dataEl = document.getElementById("scratchmap-cells");

if (el && dataEl) {
	// Filter to valid H3 indices so a corrupted or tampered cells.json can never
	// break rendering (h3-js throws on invalid input). Held in a Set so live mode can
	// merge freshly-walked cells without duplicating; `visited` is the array view.
	const visitedSet = new Set(
		(JSON.parse(dataEl.textContent || "[]") as string[]).filter(isValidCell),
	);
	let visited = [...visitedSet];

	const FOG_FILL = "rgba(82, 72, 156, 0.6)"; // violet-ultra
	const FOG_OUTLINE = "rgba(46, 40, 82, 0.65)"; // dark violet edge around the cleared area

	// Reveal resolution. Cells are stored at res-11; "filled" coarsens each to its
	// res-10 parent so sparse walks read as areas, "precise" draws the true res-11
	// hexes. Purely cosmetic — the stored data never changes.
	const REVEAL = { precise: 11, filled: 10 } as const;
	type RevealMode = keyof typeof REVEAL;

	// Zoomed out, a res-11 hex is a small fraction of a pixel, so drawing tens of
	// thousands of them costs a fortune and looks identical to drawing their parents.
	// Coarsen with the zoom instead; the mode above still caps how fine we ever go.
	//
	// Each step is the finest resolution whose hexes stay within ~3px, so the coarsening
	// is invisible: Web Mercator gives 156543·cos(lat)/2^zoom metres per pixel, and a hex
	// is about twice its edge length across. Sized at lat 58° (the northern end of the
	// data) because that's where a fixed-size hex looks biggest — anywhere further south
	// it only comes out smaller. Deliberately conservative: getting this too coarse is
	// visible as chunky blobs, while too fine only costs a little draw time.
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

	// One reveal level: the union of the visited cells coarsened to `res`, as polygons
	// with their outer ring first and any holes after, each with a lat/lng bounding box
	// so a draw can skip everything off-screen without touching its vertices.
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

		// One union per level: shared hex edges dissolve, so what remains is the outer
		// silhouette and its holes — the same shape, with far fewer vertices than the
		// honeycomb, and usable for the fill as well as the outline.
		return cellsToMultiPolygon([...drawn], false).map((polygon) => {
			const rings = polygon as [number, number][][];
			let minLat = Infinity;
			let maxLat = -Infinity;
			let minLng = Infinity;
			let maxLng = -Infinity;
			// The outer ring encloses the holes, so it alone bounds the polygon.
			for (const [lat, lng] of rings[0] ?? []) {
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
			}
			return { rings, minLat, maxLat, minLng, maxLng };
		});
	};

	// Levels are built on first use and kept — panning around at one zoom rebuilds
	// nothing, and a level you never reach is never computed. Live mode clears it.
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

	// Default to "filled": res-11 alone reads as a thin dotted trail. Choice persisted.
	const storedReveal = localStorage.getItem("scratchmap-reveal");
	let revealMode: RevealMode =
		storedReveal === "precise" || storedReveal === "filled" ? storedReveal : "filled";

	// Zoom animation is disabled on purpose: the fog canvas is drawn in current
	// container coordinates, which don't track Leaflet's mid-zoom CSS transform.
	// Instant zoom keeps the fog aligned with the tiles at every step.
	const map = L.map(el, {
		zoomControl: false,
		minZoom: 2,
		maxZoom: 19,
		worldCopyJump: true,
		zoomAnimation: false,
	});
	L.control.zoom({ position: "topright" }).addTo(map);

	// Flex-centre an icon in a Leaflet bar button so it sits right whether the button
	// is 26px (desktop) or 30px (touch). A fixed margin overflows the 26px ones.
	const centerIcon = (button: HTMLElement) => {
		button.style.display = "flex";
		button.style.alignItems = "center";
		button.style.justifyContent = "center";
	};

	// Fullscreen toggle, styled to sit right under the zoom control.
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

	// Reveal-resolution toggle (top-right, under fullscreen): switch the drawn hexes
	// between filled (res-10) and precise (res-11). Render-only; redraws in place.
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
					// Storage disabled (private mode): the toggle still works this session.
				}
				sync();
				// The badges and the stat quote the reveal on screen, so they move with it.
				refreshBadges();
				updateStat();
				draw();
			});
			return bar;
		},
	});
	map.addControl(new RevealControl({ position: "topright" }));

	// In fullscreen the frame must fill the screen (its normal height is viewport-minus-header).
	document.addEventListener("fullscreenchange", () => {
		const frame = document.getElementById("scratchmap-frame");
		if (frame) frame.style.height = document.fullscreenElement === frame ? "100%" : "";
		map.invalidateSize();
	});

	// Stat overlay — subtle grey text over the map, no card (like the friends-page note).
	const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	const formatArea = (m2: number) =>
		m2 >= 1_000_000 ? `${groupDigits(Math.round(m2 / 1_000_000))} km²` : `${groupDigits(m2)} m²`;
	const stat = document.createElement("div");
	stat.style.cssText =
		"position:absolute;left:12px;bottom:10px;z-index:1000;pointer-events:none;font-size:12px;font-variant-numeric:tabular-nums;color:#4d4d4d;text-shadow:0 1px 3px rgba(247,247,247,0.9)";
	// Both readings are true, they just answer different questions: "precise" is the ground
	// you actually stood on, "filled" is what the map clears, since one visited cell fills
	// its whole res-10 parent. The stat follows whichever reveal is on screen. Areas are
	// summed per cell rather than multiplied by an average — H3 cells vary enough in size
	// that the average runs ~10% high over this data.
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

	// Panes so labels can render above the fog.
	map.createPane("fogPane");
	map.getPane("fogPane")!.style.zIndex = "350";
	map.getPane("fogPane")!.style.pointerEvents = "none";
	map.createPane("labelPane");
	map.getPane("labelPane")!.style.zIndex = "450";
	map.getPane("labelPane")!.style.pointerEvents = "none";

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

	// Fog canvas in its own pane (below labels). Drawn in container coordinates, so
	// each draw first cancels the map pane's pan offset to re-anchor to the viewport.
	const canvas = document.createElement("canvas");
	canvas.style.position = "absolute";
	map.getPane("fogPane")!.appendChild(canvas);
	const ctx = canvas.getContext("2d");

	const draw = () => {
		if (!ctx) return;

		// Keep the canvas pinned to the viewport despite the pane's pan transform.
		L.DomUtil.setPosition(canvas, L.DomUtil.getPosition(map.getPanes().mapPane).multiplyBy(-1));

		const size = map.getSize();
		ctx.clearRect(0, 0, size.x, size.y);

		// 1. Solid fog over everything.
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = FOG_FILL;
		ctx.fillRect(0, 0, size.x, size.y);

		// 2. Cut out where you've been, then outline it. Both use the same union polygons
		// at the current level of detail, so each one is projected once and reused for the
		// hole and the stroke rather than walked twice.
		const bounds = map.getBounds().pad(0.15);
		const sw = bounds.getSouthWest();
		const ne = bounds.getNorthEast();
		const level = levelFor(Math.min(REVEAL[revealMode], lodForZoom(map.getZoom())));

		ctx.strokeStyle = FOG_OUTLINE;
		ctx.lineWidth = 1.5;
		ctx.lineJoin = "round";

		for (const polygon of level) {
			// Bounding-box reject before touching any vertex — at city zoom this skips
			// virtually the whole world.
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

			// Even-odd so the rings after the first punch holes back into the fog.
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

	// Coalesce the frequent `move` events into one draw per animation frame.
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

	// --- Completion badges: district / city / country, shown by zoom level ---
	interface Region {
		osm_id: number;
		name: string;
		level: string;
		lat: number;
		lon: number;
		/// Hexagons collected out of hexagons held, at each reveal resolution — see the
		/// matching fields in xtask's `Region`.
		explored: number;
		total: number;
		filled: number;
		filled_total: number;
		geometry?: GeoJSON.MultiPolygon;
	}
	const regionsEl = document.getElementById("scratchmap-regions");
	const regions: Region[] = regionsEl ? JSON.parse(regionsEl.textContent || "[]") : [];

	// Is a point inside a region? Ray casting, with the rings after the first in each
	// polygon treated as holes — the same "centre of the hexagon falls inside the outline"
	// rule xtask tiles with, so a badge bumped live agrees with what CI recomputes later.
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

	// A badge counts the hexagons of the reveal you're looking at. Both numerator and
	// denominator come from the same set, so no cap is needed and collecting a region
	// outright reads exactly 100%.
	interface Counts {
		explored: number;
		total: number;
		filled: number;
		filledTotal: number;
	}
	const share = (have: number, total: number) => (total > 0 ? (have / total) * 100 : 0);
	const percentFor = (r: Counts) =>
		revealMode === "filled" ? share(r.filled, r.filledTotal) : share(r.explored, r.total);

	// City/country percentages are naturally tiny — show enough decimals to be honest
	// (this is the "% of the earth you've explored" number) without going scientific.
	const formatPercent = (p: number): string => {
		if (p <= 0) return "0%";
		if (p >= 10) return `${Math.round(p)}%`;
		if (p >= 1) return `${p.toFixed(1)}%`;
		const decimals = Math.min(9, Math.max(2, 1 - Math.floor(Math.log10(p))));
		return `${p.toFixed(decimals)}%`;
	};

	const levelForZoom = (z: number): string => (z >= 13 ? "district" : z >= 10 ? "city" : "country");

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
			// Fully opaque background so the badge covers the CARTO base-map town label
			// beneath it (marker pane already sits above the label pane) — a translucent
			// fill let that label bleed through and garble the text.
			html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:#f7f7f7;border:1px solid rgba(10,9,8,0.12);border-radius:3px;padding:2px 6px;font:600 12px/1.1 system-ui,sans-serif;color:#0a0908;box-shadow:0 1px 2px rgba(0,0,0,0.2)">${name} · ${formatPercent(percent)}</span>`,
		});

	// Live-updatable state per region (keyed level:osm_id), so live mode can bump labels.
	interface RegionState extends Counts {
		name: string;
		marker: L.Marker;
		/// The outline to test freshly-walked cells against, with its bounding box so the
		/// overwhelmingly common "nowhere near here" case costs four comparisons.
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

	// The res-10 parents already accounted for in the shipped `filled_m2`. Captured before
	// live mode can add anything, so a freshly-walked cell only grows the filled area when
	// it opens a parent that wasn't already painted.
	const filledParents = new Set(visited.map((cell) => cellToParent(cell, REVEAL.filled)));

	for (const region of regions) {
		const group = badgeLayers[region.level];
		if (!group) continue;

		// The region's boundary outline (same group, so it toggles with the badge).
		if (region.geometry?.coordinates?.length) {
			L.geoJSON(region.geometry, {
				interactive: false,
				style: { color: "#2e2852", weight: 1.5, opacity: 0.85, fill: false },
			}).addTo(group);
		}

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
		}).addTo(group);
		const rings = region.geometry?.coordinates;
		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;
		// The outer ring of each polygon bounds it; the holes are inside by definition.
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

	// Attribute freshly-walked cells to regions the way CI does: each cell's res-8/5/3
	// parent → the cached region → +1, then recompute % and refresh the badge label.
	// A cell whose parent isn't cached yet (a brand-new block) waits for the next sync.
	const attributeToRegions = (cells: string[]) => {
		const dirty = new Set<string>();
		for (const cell of cells) {
			// A cell only adds to the filled reveal if its parent wasn't already painted.
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
	};

	// Both readings come from the same cells, so flipping the reveal relabels every badge
	// rather than recomputing anything.
	const refreshBadges = () => {
		for (const state of regionStates.values()) {
			state.marker.setIcon(makeBadgeIcon(state.name, percentFor(state)));
		}
	};

	let activeLevel = "";
	const updateBadges = () => {
		const level = levelForZoom(map.getZoom());
		if (level === activeLevel) return;
		activeLevel = level;
		for (const [lvl, group] of Object.entries(badgeLayers)) {
			if (lvl === level) group.addTo(map);
			else group.remove();
		}
	};
	map.on("zoomend", updateBadges);

	if (visited.length > 0) {
		const points = visited.map((cell) => cellToLatLng(cell) as [number, number]);
		map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
	} else {
		map.setView([30, 10], 4);
	}

	resize();
	updateBadges();

	// --- Live mode (logged-in only): poll the Worker for cells as you walk ---
	// Reuses the site's password cookie (same as the catalogue). The read endpoint is
	// cookie-gated server-side, so the browser never holds the read/write token.
	const API_URL =
		window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
			? "http://localhost:8787"
			: "https://api.erika.florist";
	const POLL_MS = 10000;

	let livePoll: number | undefined;
	let liveOn = false;
	let syncLiveButton: (() => void) | undefined;

	// Live "you are here": the viewer's own device position, streamed in real time from the
	// browser Geolocation API while live mode is on — so on a walk you can watch yourself
	// move over the tiles you've (already) cleared. Nothing starts until live is enabled, so
	// no location prompt appears otherwise. This is the live device fix, not the stored hexes.
	const LIVE_ICON = 48;
	const liveDotStyle = document.createElement("style");
	liveDotStyle.textContent = `
@keyframes scratchmap-live-pulse{0%{box-shadow:0 0 0 0 rgba(26,115,232,.5)}70%{box-shadow:0 0 0 14px rgba(26,115,232,0)}100%{box-shadow:0 0 0 0 rgba(26,115,232,0)}}
.scratchmap-live{position:relative;display:block;width:${LIVE_ICON}px;height:${LIVE_ICON}px}
.scratchmap-live-beam{position:absolute;inset:0;transform-origin:50% 50%;opacity:0;transition:opacity .25s ease,transform .2s linear}
.scratchmap-live-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1a73e8;border:2px solid #fff;animation:scratchmap-live-pulse 2s infinite}
@media (prefers-reduced-motion:reduce){.scratchmap-live-dot{animation:none}.scratchmap-live-beam{transition:opacity .25s ease}}`;
	document.head.appendChild(liveDotStyle);
	// The dot, plus a heading cone in the style of Google Maps. The wedge points "up" in
	// its own coordinates and is rotated to the heading; it stays hidden until we actually
	// know which way you're facing, since a cone pointing the wrong way is worse than none.
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
	// Translucent disc for the GPS accuracy radius, so you can tell whether a nearby tile is
	// really under you or just within the fix's error.
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

	// Heading, in degrees clockwise from true north. `headingDeg` is the last reading;
	// `beamAngle` is the same angle unwrapped — kept continuous across the 360° seam so the
	// CSS rotation takes the short way round instead of spinning back through a full turn.
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
			// The element only exists once the marker is on the map, so re-apply any
			// heading the compass reported while we were still waiting for a fix.
			applyHeading();
		}
		// Course over ground: only some devices report it, only while actually moving, and
		// it's where you're travelling rather than where you're facing. The compass wins
		// whenever it's available.
		if (!compassSeen) setHeading(heading === null ? null : heading);
		// Centre once, on the first real fix, then leave the map alone so panning sticks.
		if (!geoCentred) {
			map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
			geoCentred = true;
		}
	};
	// Safari exposes a true-north compass heading directly; elsewhere the absolute
	// orientation event gives `alpha`, which counts anticlockwise from north and so has to
	// be flipped. A non-absolute event is relative to wherever the device happened to start
	// and would point somewhere arbitrary, so it's ignored.
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
		// iOS 13+ gates the compass behind a prompt that has to originate from a user
		// gesture — live mode is turned on by a click, which is one.
		const DOE = window.DeviceOrientationEvent as
			| (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
			| undefined;
		if (typeof DOE?.requestPermission === "function") {
			try {
				if ((await DOE.requestPermission()) !== "granted") return;
			} catch {
				return; // Declined, or not called from a gesture — carry on without a cone.
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

	// Merge freshly-fetched cells; redraw only if something is actually new. `recenter`
	// re-centres on the last-walked hex (used when live mode first starts).
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
			// Network hiccup while walking — keep the current view and retry next tick.
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
			void fetchLive(true); // immediate refresh, centred on the last-walked hex
			startPolling();
		} else {
			stopPolling();
			stopGeolocation();
		}
		syncLiveButton?.();
	};

	// Pause polling while the tab is hidden (saves battery/data on a walk); resume on return.
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

	// Reveal the Live control only for a logged-in visitor (same check the catalogue uses).
	// `#live` in the URL auto-starts it, so the live view can be bookmarked on a phone.
	void (async () => {
		if (!document.cookie.split(";").some((c) => c.trim().startsWith("logged_in="))) return;
		try {
			const res = await fetch(`${API_URL}/auth`, { credentials: "include" });
			if (!res.ok) return;
			const data = (await res.json()) as { authenticated?: boolean };
			if (data.authenticated !== true) return;
			addLiveControl();
			if (location.hash === "#live") setLive(true);
		} catch {
			// Auth check failed — stay in static mode.
		}
	})();
}

export {};
