import * as L from "leaflet";
import { cellToLatLng, isValidCell } from "h3-js";
import { addBarButton } from "./controls";

const API_URL =
	window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
		? "http://localhost:8787"
		: "https://api.erika.florist";
const POLL_MS = 10000;

const LIVE_ICON = 48;

export function setupLive(
	map: L.Map,
	onCells: (cells: string[]) => void,
	setPosition: (latlng: L.LatLng | null) => void,
): void {
	// Everyone but the logged-in walker stops here, before any DOM setup happens.
	if (!document.cookie.split(";").some((c) => c.trim().startsWith("logged_in="))) return;

	let livePoll: number | undefined;
	let liveOn = false;
	let syncLiveButton: (() => void) | undefined;

	// The viewer's own device position while live mode is on. Nothing starts before
	// live is enabled, so no location prompt appears otherwise.
	// The pulse animates transform and opacity only, so it runs on the compositor;
	// a box-shadow pulse repaints every frame for the whole walk.
	const liveDotStyle = document.createElement("style");
	liveDotStyle.textContent = `
@keyframes scratchmap-live-pulse{0%{transform:scale(1);opacity:1}70%{transform:scale(3);opacity:0}100%{transform:scale(3);opacity:0}}
.scratchmap-live{position:relative;display:block;width:${LIVE_ICON}px;height:${LIVE_ICON}px}
.scratchmap-live-beam{position:absolute;inset:0;transform-origin:50% 50%;opacity:0;transition:opacity .25s ease,transform .2s linear}
.scratchmap-live-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1a73e8;border:2px solid #fff}
.scratchmap-live-dot::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:2px solid rgba(26,115,232,.5);animation:scratchmap-live-pulse 2s infinite}
@media (prefers-reduced-motion:reduce){.scratchmap-live-dot::after{display:none}.scratchmap-live-beam{transition:opacity .25s ease}}`;
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
	// The element is cached and heading writes coalesce to one per frame: compass
	// events arrive at up to 60 Hz, on two listeners.
	let beamEl: SVGElement | null = null;
	const applyHeading = () => {
		beamEl ??=
			positionMarker.getElement()?.querySelector<SVGElement>(".scratchmap-live-beam") ?? null;
		if (!beamEl) return;
		if (headingDeg === null) {
			beamEl.style.opacity = "0";
			return;
		}
		beamAngle += ((((headingDeg - beamAngle) % 360) + 540) % 360) - 180;
		beamEl.style.transform = `rotate(${beamAngle}deg)`;
		beamEl.style.opacity = "1";
	};
	let headingFrame: number | undefined;
	const setHeading = (deg: number | null) => {
		if (deg !== null && !Number.isFinite(deg)) return;
		headingDeg = deg;
		if (headingFrame !== undefined) return;
		headingFrame = requestAnimationFrame(() => {
			headingFrame = undefined;
			applyHeading();
		});
	};

	const onGeoPosition = (pos: GeolocationPosition) => {
		const { latitude, longitude, accuracy, heading } = pos.coords;
		positionMarker.setLatLng([latitude, longitude]);
		accuracyCircle.setLatLng([latitude, longitude]).setRadius(accuracy);
		setPosition(L.latLng(latitude, longitude));
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
		setPosition(null);
		if (positionShown) {
			positionMarker.remove();
			accuracyCircle.remove();
			positionShown = false;
			// Re-adding the marker creates a new element; the cache must not outlive it.
			beamEl = null;
		}
	};

	// The endpoint is cookie-gated, so the browser never holds the write token.
	const fetchLive = async (recenter: boolean) => {
		try {
			const res = await fetch(`${API_URL}/scratchmap/live`, { credentials: "include" });
			if (!res.ok) return;
			const data = (await res.json()) as { cells?: string[]; last?: string | null };
			onCells(data.cells ?? []);
			// Centre on the last-walked hex when live mode was just enabled.
			if (recenter && data.last && isValidCell(data.last)) {
				const [lat, lng] = cellToLatLng(data.last);
				map.setView([lat, lng], Math.max(map.getZoom(), 16));
			}
		} catch {
			// Network error: keep the view, retry next tick.
		}
	};

	// Seconds until the next poll, shown as tiny text inside the Live button.
	let nextPollAt = 0;
	let countdownTimer: number | undefined;
	let countdownEl: HTMLElement | null = null;
	const updateCountdown = () => {
		if (!countdownEl) return;
		const seconds = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
		countdownEl.textContent = String(seconds);
	};

	const startPolling = () => {
		if (livePoll === undefined) {
			nextPollAt = Date.now() + POLL_MS;
			livePoll = window.setInterval(() => {
				nextPollAt = Date.now() + POLL_MS;
				void fetchLive(false);
			}, POLL_MS);
			countdownTimer = window.setInterval(updateCountdown, 1000);
			updateCountdown();
		}
	};
	const stopPolling = () => {
		if (livePoll !== undefined) {
			clearInterval(livePoll);
			livePoll = undefined;
		}
		if (countdownTimer !== undefined) {
			clearInterval(countdownTimer);
			countdownTimer = undefined;
		}
	};

	const setLive = (on: boolean) => {
		if (on === liveOn) return;
		liveOn = on;
		if (on) {
			startGeolocation();
			void fetchLive(true);
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
		const button = addBarButton(map, () => setLive(!liveOn));
		button.style.position = "relative";
		syncLiveButton = () => {
			button.style.color = liveOn ? "#c0392b" : "";
			button.title = liveOn
				? "Live: following new cells — click to stop"
				: "Live: off — click to follow cells as you walk";
			button.innerHTML =
				`<svg viewBox="0 0 24 24" width="16" height="16" style="display:block" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M16.24 7.76a6 6 0 0 1 0 8.48M7.76 16.24a6 6 0 0 1 0-8.48"/></svg>` +
				(liveOn
					? `<span style="position:absolute;right:1px;bottom:0;font:600 8px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none"></span>`
					: "");
			countdownEl = button.querySelector("span");
			updateCountdown();
		};
		syncLiveButton();
	};

	// Show the Live control only when the cookie survives the server's check;
	// "#live" auto-starts it.
	void (async () => {
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
