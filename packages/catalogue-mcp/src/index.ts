#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { QuickScore } from "quick-score";
import { z } from "zod";

const DATA_URL =
	process.env.CATALOGUE_URL ?? "https://erika.florist/catalogue/mcp.json";
const CACHE_DIR = join(homedir(), ".cache", "erika-catalogue-mcp");
const CACHE_FILE = join(CACHE_DIR, "data.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type EntryType = "game" | "movie" | "show" | "book";

interface Entry {
	id: string;
	type: EntryType;
	title: string;
	status: "finished" | "planned";
	tmdb_id?: number;
	igdb_id?: number;
	isbn?: string;
	rating: string | null;
	rating_number: number | null;
	finished_date: string | null;
	release_year: number | null;
	author: string | null;
	genres?: string[];
	platforms?: string[];
	runtime_minutes?: number | null;
	overview?: string | null;
	tagline?: string | null;
	authors?: string[];
	publishers?: string[];
	pages?: number | null;
	content: string;
}

interface Doc {
	version: number;
	entries: Entry[];
}

async function loadData(forceRefresh: boolean): Promise<Doc> {
	if (!forceRefresh) {
		try {
			const s = await stat(CACHE_FILE);
			if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
				return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Doc;
			}
		} catch {
			// no cache yet, fall through
		}
	}

	try {
		const res = await fetch(DATA_URL);
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const text = await res.text();
		const doc = JSON.parse(text) as Doc;
		await mkdir(CACHE_DIR, { recursive: true });
		await writeFile(CACHE_FILE, text, "utf8");
		return doc;
	} catch (err) {
		// stale-cache fallback so we still work offline once primed
		try {
			return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Doc;
		} catch {
			throw new Error(
				`Failed to fetch ${DATA_URL} and no local cache available: ${(err as Error).message}`,
			);
		}
	}
}

// QuickScore lowercases but doesn't fold diacritics, so an ASCII query like
// "Amelie" can never match a stored "Amélie". Normalize both sides.
function foldForSearch(s: string): string {
	return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

function summarize(e: Entry) {
	return {
		id: e.id,
		type: e.type,
		title: e.title,
		status: e.status,
		tmdb_id: e.tmdb_id,
		igdb_id: e.igdb_id,
		isbn: e.isbn,
		rating: e.rating,
		rating_number: e.rating_number,
		release_year: e.release_year,
		finished_date: e.finished_date,
		author: e.author,
	};
}

async function main() {
	const forceRefresh = process.argv.includes("--refresh");
	const doc = await loadData(forceRefresh);
	let entries = doc.entries;

	const server = new McpServer({
		name: "erika-catalogue-mcp",
		version: "0.1.0",
	});

	server.registerTool(
		"search_catalogue",
		{
			description:
				"Search and filter Erika's catalogue (games, movies, shows, books). Returns concise summaries; use get_entry to pull the full Markdown review.",
			inputSchema: {
				type: z
					.enum(["game", "movie", "show", "book"])
					.optional()
					.describe("Restrict to one entry type"),
				status: z
					.enum(["finished", "planned"])
					.optional()
					.describe(
						"Restrict to finished entries (rated, consumed) or planned ones (queued, not yet rated)",
					),
				rating_at_least: z
					.number()
					.int()
					.min(0)
					.max(5)
					.optional()
					.describe(
						"Minimum rating. 0=Hated, 1=Disliked, 2=Okay, 3=Liked, 4=Loved, 5=Masterpiece",
					),
				year: z
					.number()
					.int()
					.optional()
					.describe("Exact original release year of the work"),
				year_after: z
					.number()
					.int()
					.optional()
					.describe("Released in or after this year (inclusive)"),
				year_before: z
					.number()
					.int()
					.optional()
					.describe("Released in or before this year (inclusive)"),
				finished_year: z
					.number()
					.int()
					.optional()
					.describe("Year Erika finished/consumed it"),
				finished_after: z
					.string()
					.optional()
					.describe("ISO date (YYYY-MM-DD); only entries finished on/after this date"),
				finished_before: z
					.string()
					.optional()
					.describe("ISO date (YYYY-MM-DD); only entries finished on/before this date"),
				genre: z
					.string()
					.optional()
					.describe("Case-insensitive substring match on a genre name"),
				query: z
					.string()
					.optional()
					.describe(
						"Fuzzy match on title or author. Tolerant of typos, partial matches, and word reordering. Results are ranked by relevance.",
					),
				mentions: z
					.string()
					.optional()
					.describe(
						"Case-insensitive substring match against the body of the written review. Useful for finding entries that talk about a specific thing, e.g. 'camera' or 'pacing'.",
					),
				sort: z
					.enum(["relevance", "finished_date", "rating", "release_year", "title"])
					.optional()
					.describe(
						"Sort key. Defaults to 'relevance' when `query` is set, otherwise 'finished_date'.",
					),
				order: z
					.enum(["asc", "desc"])
					.optional()
					.describe("Sort direction. Defaults to 'desc' (or 'asc' when sort='title')."),
				fields: z
					.array(
						z.enum([
							"title",
							"status",
							"tmdb_id",
							"igdb_id",
							"isbn",
							"rating",
							"rating_number",
							"release_year",
							"finished_date",
							"author",
						]),
					)
					.optional()
					.describe(
						"Project results down to only these fields (`id` and `type` are always included). Use for cheap bulk pulls, e.g. fields:['rating_number'] with a high limit to grab the whole catalogue in one call.",
					),
				limit: z.number().int().min(1).max(1000).default(50),
				offset: z
					.number()
					.int()
					.min(0)
					.default(0)
					.describe("Skip this many results before returning (pagination)."),
			},
		},
		async (input) => {
			const g = input.genre?.toLowerCase();
			const mentions = input.mentions?.toLowerCase();
			let results = entries.filter((e) => {
				if (input.type && e.type !== input.type) return false;
				if (input.status && e.status !== input.status) return false;
				if (
					input.rating_at_least != null &&
					(e.rating_number == null || e.rating_number < input.rating_at_least)
				)
					return false;
				if (input.year != null && e.release_year !== input.year) return false;
				if (input.year_after != null) {
					if (e.release_year == null || e.release_year < input.year_after)
						return false;
				}
				if (input.year_before != null) {
					if (e.release_year == null || e.release_year > input.year_before)
						return false;
				}
				if (input.finished_year != null) {
					if (!e.finished_date) return false;
					if (Number(e.finished_date.slice(0, 4)) !== input.finished_year)
						return false;
				}
				if (input.finished_after) {
					if (!e.finished_date) return false;
					if (e.finished_date < input.finished_after) return false;
				}
				if (input.finished_before) {
					if (!e.finished_date) return false;
					if (e.finished_date > input.finished_before) return false;
				}
				if (g) {
					const genres = (e.genres ?? []).map((x) => x.toLowerCase());
					if (!genres.some((x) => x.includes(g))) return false;
				}
				if (mentions) {
					if (!e.content.toLowerCase().includes(mentions)) return false;
				}
				return true;
			});

			if (input.query) {
				const scorable = results.map((e) => ({
					title: e.title,
					author: e.author ?? "",
					ref: e,
				}));
				const qs = new QuickScore(scorable, {
					keys: ["title", "author"],
					minimumScore: 0.2,
					sortKey: "title",
					transformString: foldForSearch,
				});
				results = qs.search(input.query).map((r) => r.item.ref);
			}

			let sort = input.sort ?? (input.query ? "relevance" : "finished_date");
			if (sort === "relevance" && !input.query) sort = "finished_date";
			if (sort !== "relevance") {
				const dir =
					(input.order ?? (sort === "title" ? "asc" : "desc")) === "asc" ? 1 : -1;
				const compare = {
					finished_date: (a: Entry, b: Entry) =>
						(a.finished_date ?? "").localeCompare(b.finished_date ?? ""),
					rating: (a: Entry, b: Entry) =>
						(a.rating_number ?? -1) - (b.rating_number ?? -1),
					release_year: (a: Entry, b: Entry) =>
						(a.release_year ?? 0) - (b.release_year ?? 0),
					title: (a: Entry, b: Entry) => a.title.localeCompare(b.title),
				};
				const cmp = compare[sort as keyof typeof compare];
				results = [...results].sort((a, b) => {
					const c = cmp(a, b);
					if (c !== 0) return dir * c;
					return (
						(b.rating_number ?? -1) - (a.rating_number ?? -1) ||
						(b.finished_date ?? "").localeCompare(a.finished_date ?? "")
					);
				});
			}

			const sliced = results.slice(input.offset, input.offset + input.limit);
			const project = (
				s: ReturnType<typeof summarize>,
			): Record<string, unknown> => {
				if (!input.fields) return s;
				const out: Record<string, unknown> = { id: s.id, type: s.type };
				for (const f of input.fields) out[f] = (s as Record<string, unknown>)[f];
				return out;
			};
			const payload = {
				total_matches: results.length,
				offset: input.offset,
				returned: sliced.length,
				results: sliced.map(summarize).map(project),
			};
			return {
				content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
			};
		},
	);

	server.registerTool(
		"get_entry",
		{
			description:
				"Get a full catalogue entry, including Erika's written review as raw Markdown in `content`.",
			inputSchema: {
				type: z.enum(["game", "movie", "show", "book"]),
				id: z.string().describe("Entry slug, e.g. 'hotline-miami'"),
			},
		},
		async ({ type, id }) => {
			const entry = entries.find((e) => e.type === type && e.id === id);
			if (!entry) {
				const pool = entries
					.filter((e) => e.type === type)
					.map((e) => ({ id: e.id, title: e.title, ref: e }));
				const qs = new QuickScore(pool, {
					keys: ["id", "title"],
					minimumScore: 0.2,
					sortKey: "id",
					transformString: foldForSearch,
				});
				// Slugs from other sources often carry a disambiguating -YEAR/-N suffix
				// (e.g. "casino-royale-2006") the catalogue slug lacks; drop it so the
				// extra token doesn't sink the fuzzy score.
				const probe = id.replace(/-\d+$/, "").replace(/-/g, " ");
				const suggestions = qs
					.search(probe)
					.slice(0, 5)
					.map((r) => `${r.item.ref.id} (${r.item.ref.title})`);
				const text = suggestions.length
					? `No ${type} found with id "${id}". Did you mean: ${suggestions.join(", ")}?`
					: `No ${type} found with id "${id}".`;
				return {
					content: [{ type: "text", text }],
					isError: true,
				};
			}
			return {
				content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
			};
		},
	);

	server.registerTool(
		"check_catalogue",
		{
			description:
				"Batch existence check. Given external IDs (TMDb for movies/shows, IGDB for games) and/or catalogue slugs, report which items Erika has already logged and how she rated them. Use this to cross-reference a candidate list against her catalogue in one call — the `not_found` bucket is exactly the set she hasn't logged. Prefer this over many get_entry calls, and prefer external IDs over slugs (slugs can differ from other sources; IDs are exact).",
			inputSchema: {
				tmdb_ids: z
					.array(z.number().int())
					.optional()
					.describe("TMDb IDs; match against movies and shows"),
				igdb_ids: z
					.array(z.number().int())
					.optional()
					.describe("IGDB IDs; match against games"),
				ids: z
					.array(z.string())
					.optional()
					.describe("Catalogue slugs, e.g. 'hotline-miami'"),
			},
		},
		async ({ tmdb_ids, igdb_ids, ids }) => {
			if (!tmdb_ids?.length && !igdb_ids?.length && !ids?.length) {
				return {
					content: [
						{
							type: "text",
							text: "Provide at least one of tmdb_ids, igdb_ids, or ids.",
						},
					],
					isError: true,
				};
			}

			const byTmdb = new Map<number, Entry>();
			const byIgdb = new Map<number, Entry>();
			const bySlug = new Map<string, Entry>();
			for (const e of entries) {
				if (e.tmdb_id != null) byTmdb.set(e.tmdb_id, e);
				if (e.igdb_id != null) byIgdb.set(e.igdb_id, e);
				bySlug.set(e.id, e);
			}

			const found: Array<
				{ matched_by: string; query: string | number } & ReturnType<
					typeof summarize
				>
			> = [];
			const not_found = {
				tmdb_ids: [] as number[],
				igdb_ids: [] as number[],
				ids: [] as string[],
			};

			for (const t of tmdb_ids ?? []) {
				const e = byTmdb.get(t);
				if (e) found.push({ matched_by: "tmdb_id", query: t, ...summarize(e) });
				else not_found.tmdb_ids.push(t);
			}
			for (const g of igdb_ids ?? []) {
				const e = byIgdb.get(g);
				if (e) found.push({ matched_by: "igdb_id", query: g, ...summarize(e) });
				else not_found.igdb_ids.push(g);
			}
			for (const s of ids ?? []) {
				const e = bySlug.get(s);
				if (e) found.push({ matched_by: "id", query: s, ...summarize(e) });
				else not_found.ids.push(s);
			}

			const payload = {
				found_count: found.length,
				not_found_count:
					not_found.tmdb_ids.length +
					not_found.igdb_ids.length +
					not_found.ids.length,
				found,
				not_found,
			};
			return {
				content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
			};
		},
	);

	server.registerTool(
		"list_recent",
		{
			description: "List recently-finished entries, newest first.",
			inputSchema: {
				type: z.enum(["game", "movie", "show", "book"]).optional(),
				limit: z.number().int().min(1).max(100).default(20),
			},
		},
		async ({ type, limit }) => {
			const recent = entries
				.filter((e) => (type ? e.type === type : true))
				.filter((e) => !!e.finished_date)
				.sort((a, b) =>
					(b.finished_date ?? "").localeCompare(a.finished_date ?? ""),
				)
				.slice(0, limit);
			return {
				content: [
					{ type: "text", text: JSON.stringify(recent.map(summarize), null, 2) },
				],
			};
		},
	);

	server.registerTool(
		"stats",
		{
			description:
				"Overall catalogue stats over finished entries (planned backlog excluded): counts per type, average ratings, latest finished date.",
			inputSchema: {},
		},
		async () => {
			const byType: Record<
				string,
				{ count: number; rating_sum: number; rating_n: number }
			> = {};
			const finished = entries.filter((e) => e.status !== "planned");
			let latest: string | null = null;
			for (const e of finished) {
				byType[e.type] ??= { count: 0, rating_sum: 0, rating_n: 0 };
				const b = byType[e.type]!;
				b.count += 1;
				if (e.rating_number != null) {
					b.rating_sum += e.rating_number;
					b.rating_n += 1;
				}
				if (e.finished_date && (!latest || e.finished_date > latest))
					latest = e.finished_date;
			}
			const by_type = Object.fromEntries(
				Object.entries(byType).map(([t, s]) => [
					t,
					{
						count: s.count,
						average_rating: s.rating_n
							? Number((s.rating_sum / s.rating_n).toFixed(2))
							: null,
					},
				]),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: finished.length,
								by_type,
								latest_finished_date: latest,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.registerTool(
		"rating_summary",
		{
			description:
				"Aggregate how Erika rates a slice of the catalogue defined by genre and/or author. Returns count, average rating, the full rating distribution, and her top-rated examples in that slice. `author` matches the same field search exposes: production company for movies, developer for games, writer for books — directors are NOT stored. Answers questions like 'how does she rate horror?' or 'what's her average for FromSoftware?'.",
			inputSchema: {
				type: z
					.enum(["game", "movie", "show", "book"])
					.optional()
					.describe("Restrict to one entry type"),
				genre: z
					.string()
					.optional()
					.describe("Case-insensitive match on a genre name"),
				author: z
					.string()
					.optional()
					.describe(
						"Case-insensitive match on the author field (company/developer/writer)",
					),
			},
		},
		async ({ type, genre, author }) => {
			if (!genre && !author && !type) {
				return {
					content: [
						{
							type: "text",
							text: "Provide at least one of genre, author, or type.",
						},
					],
					isError: true,
				};
			}
			const g = genre ? foldForSearch(genre) : null;
			const a = author ? foldForSearch(author) : null;
			const matched = entries.filter((e) => {
				if (type && e.type !== type) return false;
				if (
					g &&
					!(e.genres ?? []).some((x) => foldForSearch(x).includes(g))
				)
					return false;
				if (a && !foldForSearch(e.author ?? "").includes(a)) return false;
				return true;
			});
			const distribution: Record<string, number> = {
				Masterpiece: 0,
				Loved: 0,
				Liked: 0,
				Okay: 0,
				Disliked: 0,
				Hated: 0,
			};
			let sum = 0;
			let rated = 0;
			for (const e of matched) {
				if (e.rating_number == null || e.rating == null) continue;
				sum += e.rating_number;
				rated += 1;
				if (e.rating in distribution)
					distribution[e.rating] = (distribution[e.rating] ?? 0) + 1;
			}
			const payload = {
				count: matched.length,
				average_rating: rated ? Number((sum / rated).toFixed(2)) : null,
				distribution,
				examples: [...matched]
					.sort((x, y) => (y.rating_number ?? -1) - (x.rating_number ?? -1))
					.slice(0, 5)
					.map(summarize),
			};
			return {
				content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
			};
		},
	);

	server.registerTool(
		"refresh",
		{
			description:
				"Refetch the catalogue from the live JSON endpoint, bypassing the 24h cache. Use this if entries have been added or updated since the server started.",
			inputSchema: {},
		},
		async () => {
			const before = entries.length;
			const fresh = await loadData(true);
			entries = fresh.entries;
			return {
				content: [
					{
						type: "text",
						text: `Refreshed. ${entries.length} entries loaded (was ${before}).`,
					},
				],
			};
		},
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("[catalogue-mcp] fatal:", err);
	process.exit(1);
});
