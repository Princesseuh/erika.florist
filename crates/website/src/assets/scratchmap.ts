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
import { cellToBoundary, cellToLatLng, cellToParent, cellsToMultiPolygon, isValidCell } from "h3-js";

const el = document.getElementById("scratchmap-map");
const dataEl = document.getElementById("scratchmap-cells");

if (el && dataEl) {
	// Filter to valid H3 indices so a corrupted or tampered cells.json can never
	// break rendering (h3-js throws on invalid input).
	const visited = (JSON.parse(dataEl.textContent || "[]") as string[]).filter(isValidCell);

	const FOG_FILL = "rgba(82, 72, 156, 0.6)"; // violet-ultra
	const FOG_OUTLINE = "rgba(46, 40, 82, 0.65)"; // dark violet edge around the cleared area

	// Reveal resolution. Cells are stored at res-11; "filled" coarsens each to its
	// res-10 parent so sparse walks read as areas, "precise" draws the true res-11
	// hexes. Purely cosmetic — the stored data never changes. Precompute the drawn
	// cells (deduped) and their centres per mode once, for cheap in-viewport filtering.
	const REVEAL = { precise: 11, filled: 10 } as const;
	type RevealMode = keyof typeof REVEAL;

	const pointsForRes = (res: number) => {
		const seen = new Set<string>();
		const points: { cell: string; lat: number; lng: number }[] = [];
		for (const cell of visited) {
			const drawn = res === 11 ? cell : cellToParent(cell, res);
			if (seen.has(drawn)) continue;
			seen.add(drawn);
			const [lat, lng] = cellToLatLng(drawn);
			points.push({ cell: drawn, lat, lng });
		}
		return points;
	};
	const revealPoints: Record<RevealMode, ReturnType<typeof pointsForRes>> = {
		precise: pointsForRes(REVEAL.precise),
		filled: pointsForRes(REVEAL.filled),
	};

	// Precompute the union outline of the cleared cells per mode — dissolving shared
	// hex edges so only the outer silhouette (and any interior holes) gets stroked,
	// not a honeycomb of every internal border.
	const unionLoops = (mode: RevealMode): [number, number][][] => {
		const cells = revealPoints[mode].map((p) => p.cell);
		const loops: [number, number][][] = [];
		if (cells.length) {
			for (const polygon of cellsToMultiPolygon(cells, false)) {
				for (const loop of polygon) loops.push(loop as [number, number][]);
			}
		}
		return loops;
	};
	const outlineLoops: Record<RevealMode, [number, number][][]> = {
		precise: unionLoops("precise"),
		filled: unionLoops("filled"),
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

	// Fullscreen toggle, styled to sit right under the zoom control.
	// L.Control.extend is dynamically typed, hence the `any`.
	const FullscreenControl = (L.Control as any).extend({
		onAdd() {
			const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			const button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
			button.href = "#";
			button.title = "Toggle fullscreen";
			button.setAttribute("role", "button");
			button.innerHTML =
				'<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;margin:6px auto" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>';
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
		`<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;margin:6px auto" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/></svg>`;
	const RevealControl = (L.Control as any).extend({
		onAdd() {
			const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			const button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
			button.href = "#";
			button.setAttribute("role", "button");
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
	const hexCount = visited.length;
	stat.textContent =
		hexCount === 0
			? "Nothing discovered yet"
			: `${hexCount} hexagon${hexCount === 1 ? "" : "s"} · ~${formatArea(Math.round(hexCount * 2150.6))}`;
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

		// 2. Cut out your visited cells (their jagged union is the only hex shape seen).
		const bounds = map.getBounds().pad(0.15);
		ctx.globalCompositeOperation = "destination-out";
		for (const pt of revealPoints[revealMode]) {
			if (!bounds.contains([pt.lat, pt.lng])) continue;
			const boundary = cellToBoundary(pt.cell);
			ctx.beginPath();
			for (let i = 0; i < boundary.length; i++) {
				const point = map.latLngToContainerPoint([boundary[i][0], boundary[i][1]]);
				if (i === 0) ctx.moveTo(point.x, point.y);
				else ctx.lineTo(point.x, point.y);
			}
			ctx.closePath();
			ctx.fill();
		}

		// 3. Trace a faint outline around the cleared silhouette (union loops, so shared
		// hex edges are dissolved — only the outer border and any holes are drawn).
		ctx.globalCompositeOperation = "source-over";
		ctx.strokeStyle = FOG_OUTLINE;
		ctx.lineWidth = 1.5;
		ctx.lineJoin = "round";
		for (const loop of outlineLoops[revealMode]) {
			ctx.beginPath();
			for (let i = 0; i < loop.length; i++) {
				const point = map.latLngToContainerPoint([loop[i][0], loop[i][1]]);
				if (i === 0) ctx.moveTo(point.x, point.y);
				else ctx.lineTo(point.x, point.y);
			}
			ctx.closePath();
			ctx.stroke();
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
		name: string;
		level: string;
		lat: number;
		lon: number;
		percent: number;
		geometry?: GeoJSON.MultiPolygon;
	}
	const regionsEl = document.getElementById("scratchmap-regions");
	const regions: Region[] = regionsEl ? JSON.parse(regionsEl.textContent || "[]") : [];

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

		const icon = L.divIcon({
			className: "",
			iconSize: [0, 0],
			iconAnchor: [0, 0],
			html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(247,247,247,0.92);border:1px solid rgba(10,9,8,0.12);border-radius:3px;padding:2px 6px;font:600 12px/1.1 system-ui,sans-serif;color:#0a0908;box-shadow:0 1px 2px rgba(0,0,0,0.15)">${region.name} · ${formatPercent(region.percent)}</span>`,
		});
		L.marker([region.lat, region.lon], { icon, interactive: false, keyboard: false }).addTo(group);
	}

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
}

export {};
