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
// The reveal resolution scales with zoom (refining to the stored res 11 up close)
// but is floored so a clearing stays visible without ballooning when zoomed out.
// Leaflet + h3-js are bundled from npm.

import * as L from "leaflet";
import {
	cellToBoundary,
	cellToLatLng,
	cellToParent,
	getHexagonEdgeLengthAvg,
	isValidCell,
	UNITS,
} from "h3-js";

const el = document.getElementById("scratchmap-map");
const dataEl = document.getElementById("scratchmap-cells");

if (el && dataEl) {
	// Filter to valid H3 indices so a corrupted or tampered cells.json can never
	// break rendering (h3-js throws on invalid input).
	const visited = (JSON.parse(dataEl.textContent || "[]") as string[]).filter(isValidCell);
	const visitedSet = new Set(visited);

	const DATA_RES = 11; // resolution the hexes are stored at
	const REVEAL_MIN_RES = 7; // coarsest a clearing may get (~1.4 km) when zoomed out
	const TARGET_HEX_PX = 22; // desired on-screen size of a revealed cell

	const FOG_FILL = "rgba(82, 72, 156, 0.6)"; // violet-ultra

	// Revealed cells at a given resolution (a coarse cell counts as revealed if you
	// visited any res-11 cell inside it), with their centers cached for cheap
	// in-viewport filtering.
	const revealedPtsCache = new Map<number, { cell: string; lat: number; lng: number }[]>();
	const revealedPtsAt = (res: number) => {
		let pts = revealedPtsCache.get(res);
		if (!pts) {
			const cells =
				res >= DATA_RES ? visitedSet : new Set(visited.map((c) => cellToParent(c, res)));
			pts = [...cells].map((cell) => {
				const [lat, lng] = cellToLatLng(cell);
				return { cell, lat, lng };
			});
			revealedPtsCache.set(res, pts);
		}
		return pts;
	};

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

	// Pick the reveal resolution: closest to TARGET_HEX_PX at this zoom, floored so a
	// clearing never balloons, capped at the stored resolution.
	const revealResForZoom = (): number => {
		const lat = map.getCenter().lat;
		const metersPerPixel =
			(40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
		const targetMeters = TARGET_HEX_PX * metersPerPixel;
		let best = DATA_RES;
		let bestDiff = Number.POSITIVE_INFINITY;
		for (let cand = REVEAL_MIN_RES; cand <= DATA_RES; cand++) {
			const diff = Math.abs(getHexagonEdgeLengthAvg(cand, UNITS.m) - targetMeters);
			if (diff < bestDiff) {
				bestDiff = diff;
				best = cand;
			}
		}
		return best;
	};

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

		// 2. Cut out the revealed cells (their jagged union is the only hex shape seen).
		const res = revealResForZoom();
		const bounds = map.getBounds().pad(0.15);
		ctx.globalCompositeOperation = "destination-out";
		for (const pt of revealedPtsAt(res)) {
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
		ctx.globalCompositeOperation = "source-over";
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
