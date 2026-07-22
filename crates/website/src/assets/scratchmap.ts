// Scratch map: a real OpenStreetMap-backed slippy map (CARTO Positron — clean, no
// business POIs) with the visited H3 hexes drawn on top. Leaflet is bundled from
// npm; the hex outlines are precomputed at build time and embedded as JSON, so no
// H3 library is needed in the browser.

import * as L from "leaflet";

const el = document.getElementById("scratchmap-map");
const dataEl = document.getElementById("scratchmap-hexes");

if (el && dataEl) {
	const hexes = JSON.parse(dataEl.textContent || "[]") as [number, number][][];

	const map = L.map(el, {
		zoomControl: false,
		preferCanvas: true,
		worldCopyJump: true,
		minZoom: 2,
	});
	L.control.zoom({ position: "topright" }).addTo(map);

	L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
		subdomains: "abcd",
		maxZoom: 20,
	}).addTo(map);

	// One canvas renderer for all hexes keeps thousands of cells performant.
	const renderer = L.canvas({ padding: 0.5 });
	const group = L.featureGroup();
	for (const ring of hexes) {
		L.polygon(ring, {
			renderer,
			color: "#c73c2e",
			weight: 1,
			fillColor: "#c73c2e",
			fillOpacity: 0.4,
		}).addTo(group);
	}
	group.addTo(map);

	if (hexes.length > 0) {
		map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 14 });
	} else {
		map.setView([20, 0], 2);
	}
}

export {};
