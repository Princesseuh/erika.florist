// Local-first data layer for the scratch map, in the shape of catalogue-db.ts: the
// page carries only a content hash, this module serves the data from IndexedDB and
// refetches content.json only when the hash changed.
export const DB_NAME = "scratchmap";
export const DB_VERSION = 1;

export interface ScratchmapRegion {
	osm_id: number;
	name: string;
	level: string;
	lat: number;
	lon: number;
	explored: number;
	total: number;
	filled: number;
	filled_total: number;
	geometry?: GeoJSON.MultiPolygon;
}

export interface ScratchmapCache {
	cells: string[];
	regions: ScratchmapRegion[];
}

export interface LiveCacheEntry {
	osm_id: number;
	level: string;
	area: number;
}

type ScratchmapContent = [hash: string, cells: string[], regions: ScratchmapRegion[]];

function createStores(db: IDBDatabase): void {
	for (const name of Array.from(db.objectStoreNames)) {
		db.deleteObjectStore(name);
	}
	db.createObjectStore("data", { keyPath: "id" });
	db.createObjectStore("meta", { keyPath: "id" });
}

function isContent(value: unknown): value is ScratchmapContent {
	return (
		Array.isArray(value) &&
		value.length >= 3 &&
		typeof value[0] === "string" &&
		Array.isArray(value[1]) &&
		Array.isArray(value[2])
	);
}

let dbHandle: IDBDatabase | undefined;

// onReady fires with the data in both the cache-hit and fetch paths; seeding is
// background work.
export function loadScratchmapCache(
	latestHash: string,
	onReady: (cache: ScratchmapCache) => void,
	onError: () => void,
): void {
	let db: IDBDatabase;

	// One atomic transaction: an abort commits nothing, so the cache is never marked
	// complete but half-seeded.
	function seed(hash: string, cache: ScratchmapCache): void {
		const tx = db.transaction(["data", "meta"], "readwrite");
		tx.objectStore("data").put({ id: "content", ...cache });
		tx.objectStore("meta").put({ complete: true, hash, id: "version", timestamp: Date.now() });
		tx.addEventListener("error", () => {
			console.error("Failed to seed scratchmap cache", tx.error);
		});
	}

	async function fetchAndSeed(): Promise<void> {
		let data: ScratchmapContent;
		try {
			const response = await fetch(`/scratchmap/content.json?v=${latestHash}`);
			const json: unknown = await response.json();
			if (!isContent(json)) {
				throw new Error("Invalid scratchmap data format");
			}
			data = json;
		} catch (error) {
			console.error("Failed to fetch scratchmap content", error);
			onError();
			return;
		}
		const [hash, cells, regions] = data;
		onReady({ cells, regions });
		seed(hash, { cells, regions });
	}

	function loadFromCache(): void {
		const req: IDBRequest<unknown> = db
			.transaction("data", "readonly")
			.objectStore("data")
			.get("content");
		req.addEventListener("success", () => {
			const raw = req.result;
			if (typeof raw === "object" && raw !== null && "cells" in raw && "regions" in raw) {
				const { cells, regions } = raw as ScratchmapCache;
				onReady({ cells, regions });
			} else {
				void fetchAndSeed();
			}
		});
		req.addEventListener("error", () => {
			console.error("Failed to read scratchmap cache, refetching", req.error);
			void fetchAndSeed();
		});
	}

	function checkFreshness(): void {
		const req: IDBRequest<unknown> = db
			.transaction("meta", "readonly")
			.objectStore("meta")
			.get("version");
		req.addEventListener("success", () => {
			const raw = req.result;
			const fresh =
				typeof raw === "object" &&
				raw !== null &&
				"hash" in raw &&
				"complete" in raw &&
				(raw as { hash: unknown }).hash === latestHash &&
				(raw as { complete: unknown }).complete === true;
			if (fresh) {
				loadFromCache();
			} else {
				void fetchAndSeed();
			}
		});
		req.addEventListener("error", () => {
			void fetchAndSeed();
		});
	}

	const openRequest = indexedDB.open(DB_NAME, DB_VERSION);
	openRequest.addEventListener("upgradeneeded", () => createStores(openRequest.result));
	openRequest.addEventListener("success", () => {
		db = openRequest.result;
		dbHandle = db;
		checkFreshness();
	});
	openRequest.addEventListener("error", () => {
		console.error("Failed to open scratchmap database, resetting", openRequest.error);
		const del = indexedDB.deleteDatabase(DB_NAME);
		del.addEventListener("success", () => {
			const retry = indexedDB.open(DB_NAME, DB_VERSION);
			retry.addEventListener("upgradeneeded", () => createStores(retry.result));
			retry.addEventListener("success", () => {
				db = retry.result;
				dbHandle = db;
				void fetchAndSeed();
			});
			retry.addEventListener("error", onError);
		});
		del.addEventListener("error", () => {
			console.error("Failed to delete scratchmap database", del.error);
			onError();
		});
	});
}

// The live-view attribution cache, fetched only for the logged-in owner and cached
// under the same content hash. Resolves {} on any failure: live mode then simply
// stops updating badges between syncs.
export async function loadLiveCache(
	latestHash: string,
): Promise<Record<string, LiveCacheEntry | null>> {
	const db = dbHandle;
	if (db) {
		const cached = await new Promise<Record<string, LiveCacheEntry | null> | undefined>(
			(resolve) => {
				const req: IDBRequest<unknown> = db
					.transaction("data", "readonly")
					.objectStore("data")
					.get("live-cache");
				req.addEventListener("success", () => {
					const raw = req.result;
					if (
						typeof raw === "object" &&
						raw !== null &&
						"hash" in raw &&
						(raw as { hash: unknown }).hash === latestHash &&
						"data" in raw
					) {
						resolve((raw as { data: Record<string, LiveCacheEntry | null> }).data);
					} else {
						resolve(undefined);
					}
				});
				req.addEventListener("error", () => resolve(undefined));
			},
		);
		if (cached) return cached;
	}
	try {
		const response = await fetch(`/scratchmap/live-cache.json?v=${latestHash}`);
		const json: unknown = await response.json();
		if (!Array.isArray(json) || json.length < 2 || typeof json[1] !== "object") {
			throw new Error("Invalid live-cache format");
		}
		const [hash, data] = json as [string, Record<string, LiveCacheEntry | null>];
		if (db) {
			db.transaction("data", "readwrite")
				.objectStore("data")
				.put({ data, hash, id: "live-cache" });
		}
		return data;
	} catch (error) {
		console.error("Failed to fetch scratchmap live cache", error);
		return {};
	}
}
