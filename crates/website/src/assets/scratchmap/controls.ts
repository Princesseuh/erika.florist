import * as L from "leaflet";

// Leaflet runs onAdd synchronously inside addControl, so the button exists by
// the time this returns.
export function addBarButton(
	map: L.Map,
	onClick: (button: HTMLAnchorElement) => void,
): HTMLAnchorElement {
	let button!: HTMLAnchorElement;
	const BarButton = L.Control.extend({
		onAdd() {
			const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
			button = L.DomUtil.create("a", "", bar) as HTMLAnchorElement;
			button.href = "#";
			button.setAttribute("role", "button");
			// Flex-centre, so the icon fits both the 26 px and the 30 px button size.
			button.style.display = "flex";
			button.style.alignItems = "center";
			button.style.justifyContent = "center";
			L.DomEvent.on(button, "click", (event) => {
				L.DomEvent.stop(event);
				onClick(button);
			});
			return bar;
		},
	});
	map.addControl(new BarButton({ position: "topright" }));
	return button;
}
