import * as L from "leaflet";
import { cellToLatLng } from "h3-js";
import { type ScratchmapCache, loadScratchmapCache } from "./db";
import { addBarButton } from "./controls";
import { createFog } from "./fog";
import { createRegions } from "./regions";
import { addSearchControl } from "./search";
import { setupLive } from "./live";

// One line to swap the whole basemap, because this is the part that keeps breaking.
const BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Raise for more street detail, lower for a cleaner fog.
const BASEMAP_FADE = 0.65;

const FULLSCREEN_ICON =
	'<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>';

const hexIcon = (filled: boolean) =>
	`<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/></svg>`;

function init(el: HTMLElement, data: ScratchmapCache): void {
	// Off because a zoom-out scales the viewport-sized fog canvas down, baring its edges.
	const map = L.map(el, {
		zoomControl: false,
		minZoom: 2,
		maxZoom: 19,
		worldCopyJump: true,
		zoomAnimation: false,
		// A pinch otherwise rounds to a whole level on release, which reads as a snap.
		zoomSnap: 0,
		// Outlines only redraw on moveend, so the surface has to outrun a drag.
		renderer: L.svg({ padding: 0.5 }),
		// A click frames the region under it; a double click fires that twice, under
		// Leaflet's own zoom.
		doubleClickZoom: false,
	});
	L.control.zoom({ position: "topright" }).addTo(map);

	// Fixed pane order: fog 350 < badges 590 < live dot (default 600).
	// Badges avoid the default marker pane, which rewrites marker z-indexes during
	// pans. translateZ(0) pins each pane to its own compositing layer now: lazily
	// promoted layers can composite in paint order instead of z-index order, which
	// let outlines flash above badges during pans (WebKit).
	const pane = (name: string, zIndex: string) => {
		const paneEl = map.createPane(name);
		paneEl.style.zIndex = zIndex;
		paneEl.style.pointerEvents = "none";
		paneEl.style.transform = "translateZ(0)";
		paneEl.style.willChange = "transform";
	};
	pane("fogPane", "350");
	pane("badgePane", "590");
	// The outline SVG is the layer most prone to lazy promotion; pin it too.
	map.getPane("overlayPane")!.style.transform = "translateZ(0)";
	map.getPane("overlayPane")!.style.willChange = "transform";

	// Flat basemap colour under missing tiles, so the fog composites to the
	// same purple whether tiles have arrived or not. It must be on the
	// container: Leaflet panes have no size of their own, so a pane
	// background never paints. The page ships the fog-over-this colour
	// (#9996c0) instead, for the moment before the fog first draws.
	el.style.background = "#dfe3e3";

	// Desaturated and faded on the pane rather than per tile: one composited filter instead
	// of one per image. Turns the standard OSM style into something close to the light canvas
	// this map was designed against, and sits it back so the fog is what reads.
	map.getPane("tilePane")!.style.filter =
		`grayscale(1) brightness(1.06) contrast(0.9) opacity(${BASEMAP_FADE})`;

	// The OSMF's own tiles, chosen for staying power: every keyless alternative is a company
	// tolerating us. Labels are baked in, so they sit under the fog rather than over it.
	L.tileLayer(BASEMAP_URL, {
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		maxZoom: 19,
	}).addTo(map);

	const fog = createFog(map, el, data.cells, data.parents6);
	const regions = createRegions(map, el, data.regions, fog);
	fog.setOverlay(regions.drawHighlight);
	addSearchControl(map, regions);

	const fullscreenButton = addBarButton(map, () => {
		const frame = document.getElementById("scratchmap-frame");
		if (document.fullscreenElement) void document.exitFullscreen();
		else void frame?.requestFullscreen?.();
	});
	fullscreenButton.title = "Toggle fullscreen";
	fullscreenButton.innerHTML = FULLSCREEN_ICON;

	// The frame's normal height is viewport minus header; fullscreen needs 100%.
	document.addEventListener("fullscreenchange", () => {
		const frame = document.getElementById("scratchmap-frame");
		if (frame) frame.style.height = document.fullscreenElement === frame ? "100%" : "";
		map.invalidateSize();
	});

	const syncReveal = (button: HTMLElement) => {
		const filled = fog.revealMode() === "filled";
		button.innerHTML = hexIcon(filled);
		button.title = filled
			? "Reveal: filled — click for precise"
			: "Reveal: precise — click for filled";
	};
	const revealButton = addBarButton(map, (button) => {
		fog.toggleReveal();
		syncReveal(button);
		// Badges show the active reveal too.
		regions.refreshBadges();
	});
	syncReveal(revealButton);

	if (fog.visited.size > 0) {
		// Res-6 parents bound the same area to within a few km, at 1/70th the points.
		const points = [...fog.walkedAt(6)].map((cell) => cellToLatLng(cell));
		map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
	} else {
		map.setView([30, 10], 4);
	}

	// A "#lat,lng,zoom" hash positions the map. "#live" is handled by live mode.
	const viewMatch = location.hash.match(/^#(-?[\d.]+),(-?[\d.]+),([\d.]+)$/);
	if (viewMatch) {
		const lat = Number(viewMatch[1]);
		const lng = Number(viewMatch[2]);
		const zoom = Number(viewMatch[3]);
		if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
			map.setView([lat, lng], zoom);
		}
	}

	fog.resize();
	regions.updateBadges();
	// Touch has no pointer event to wait for; the centre is already meaningful.
	regions.refreshHighlight();

	setupLive(
		map,
		(cells) => {
			// Primed before the merge: the snapshot must predate the fog set mutation.
			regions.primeLiveAttribution();
			const fresh = fog.addCells(cells);
			if (fresh.length === 0) return;
			regions.attributeToRegions(fresh);
			fog.scheduleDraw();
		},
		regions.setLivePosition,
	);
}

const el = document.getElementById("scratchmap-map");
if (el) {
	loadScratchmapCache(
		el.dataset.latest ?? "",
		(data) => init(el, data),
		() => init(el, { cells: [], regions: [], parents6: [] }),
	);
}
