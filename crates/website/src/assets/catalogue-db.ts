// Shared local-first data layer so catalogue.ts and stats.ts can't drift on DB version or seeding.
export const DB_NAME = "catalogue";
export const DB_VERSION = 10;

export type CatalogueType = "game" | "movie" | "show" | "book";

export interface CollectionRef {
	slug: string;
	title: string;
}

export interface CatalogueRecord {
	id: string;
	cover: string;
	placeholder: string;
	type: CatalogueType;
	title: string;
	rating: number;
	author: string;
	date: number;
	releaseYear: number | null;
	review: string;
	status: "finished" | "planned";
	genres: string[];
	runtime: number | null;
}

export interface CatalogueCache {
	records: CatalogueRecord[];
	collections: Record<string, CollectionRef[]>;
}

type CatalogueTuple = [
	cover: string,
	placeholder: string,
	type: number,
	title: string,
	rating: number | null,
	author: string,
	date: number | null,
	year: number | null,
	review: string,
	status: number,
	slug: string,
	genres: string[],
	runtime: number | null,
];

type CatalogueData = [string, CatalogueTuple[], Record<string, CollectionRef[]>];

function numberToType(value: number): CatalogueType {
	switch (value) {
		case 0:
			return "game";
		case 1:
			return "movie";
		case 2:
			return "show";
		default:
			return "book";
	}
}

function tupleToRecord(item: CatalogueTuple): CatalogueRecord {
	const type = numberToType(item[2]);
	return {
		id: `${item[10]}-${type}`,
		cover: item[0],
		placeholder: item[1],
		type,
		title: item[3],
		rating: item[4] ?? -1,
		author: item[5],
		date: item[6] ?? 0,
		releaseYear: item[7],
		review: item[8],
		status: item[9] === 1 ? "planned" : "finished",
		genres: item[11] ?? [],
		runtime: item[12] ?? null,
	};
}

export function createCatalogueStores(db: IDBDatabase): void {
	for (const name of Array.from(db.objectStoreNames)) {
		db.deleteObjectStore(name);
	}
	db.createObjectStore("content", { keyPath: "id" });
	db.createObjectStore("meta", { keyPath: "id" });
}

function isCatalogueData(value: unknown): value is CatalogueData {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		typeof value[0] === "string" &&
		Array.isArray(value[1])
	);
}

function collectionsFromMeta(raw: unknown): Record<string, CollectionRef[]> {
	if (typeof raw === "object" && raw !== null && "data" in raw) {
		const { data } = raw as { data: unknown };
		if (typeof data === "object" && data !== null) {
			return data as Record<string, CollectionRef[]>;
		}
	}
	return {};
}

// onReady fires with the data in both the cache-hit and fetch paths; seeding is background work.
export function loadCatalogueCache(
	latestHash: string,
	onReady: (cache: CatalogueCache) => void,
	onError: () => void,
): void {
	let db: IDBDatabase;

	// One atomic transaction: an abort commits nothing, so the cache is never marked complete but half-seeded.
	function seed(
		hash: string,
		records: CatalogueRecord[],
		collections: Record<string, CollectionRef[]>,
	): void {
		const tx = db.transaction(["content", "meta"], "readwrite");
		const contentStore = tx.objectStore("content");
		const metaStore = tx.objectStore("meta");
		contentStore.clear();
		for (const record of records) {
			contentStore.put(record);
		}
		metaStore.put({ data: collections, id: "collections" });
		metaStore.put({ complete: true, hash, id: "version", timestamp: Date.now() });
		tx.addEventListener("error", () => {
			console.error("Failed to seed catalogue cache", tx.error);
		});
	}

	async function fetchAndSeed(): Promise<void> {
		let data: CatalogueData;
		try {
			const response = await fetch("/catalogue/content.json");
			const json: unknown = await response.json();
			if (!isCatalogueData(json)) {
				throw new Error("Invalid catalogue data format");
			}
			data = json;
		} catch (error) {
			console.error("Failed to fetch catalogue content", error);
			onError();
			return;
		}
		const [hash, tuples, collections] = data;
		const records = tuples.map(tupleToRecord);
		const index = collections ?? {};
		onReady({ records, collections: index });
		seed(hash, records, index);
	}

	function loadFromCache(): void {
		const tx = db.transaction(["content", "meta"], "readonly");
		const itemsReq = tx.objectStore("content").getAll() as IDBRequest<CatalogueRecord[]>;
		const collectionsReq: IDBRequest<unknown> = tx.objectStore("meta").get("collections");
		tx.addEventListener("complete", () => {
			onReady({
				records: itemsReq.result,
				collections: collectionsFromMeta(collectionsReq.result),
			});
		});
		tx.addEventListener("error", () => {
			console.error("Failed to read catalogue cache, refetching", tx.error);
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
	openRequest.addEventListener("upgradeneeded", () => createCatalogueStores(openRequest.result));
	openRequest.addEventListener("success", () => {
		db = openRequest.result;
		checkFreshness();
	});
	openRequest.addEventListener("error", () => {
		console.error("Failed to open catalogue database, resetting", openRequest.error);
		const del = indexedDB.deleteDatabase(DB_NAME);
		del.addEventListener("success", () => {
			const retry = indexedDB.open(DB_NAME, DB_VERSION);
			retry.addEventListener("upgradeneeded", () => createCatalogueStores(retry.result));
			retry.addEventListener("success", () => {
				db = retry.result;
				void fetchAndSeed();
			});
			retry.addEventListener("error", onError);
		});
		del.addEventListener("error", () => {
			console.error("Failed to delete catalogue database", del.error);
			onError();
		});
	});
}
