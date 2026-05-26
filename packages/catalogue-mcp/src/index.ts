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
	rating: string;
	rating_number: number;
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

function summarize(e: Entry) {
	return {
		id: e.id,
		type: e.type,
		title: e.title,
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
				limit: z.number().int().min(1).max(200).default(50),
			},
		},
		async (input) => {
			const g = input.genre?.toLowerCase();
			const mentions = input.mentions?.toLowerCase();
			let results = entries.filter((e) => {
				if (input.type && e.type !== input.type) return false;
				if (
					input.rating_at_least != null &&
					e.rating_number < input.rating_at_least
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
				});
				results = qs.search(input.query).map((r) => r.item.ref);
			} else {
				results.sort((a, b) => {
					const af = a.finished_date ?? "";
					const bf = b.finished_date ?? "";
					if (af !== bf) return bf.localeCompare(af);
					return b.rating_number - a.rating_number;
				});
			}

			const limited = results.slice(0, input.limit);
			const payload = {
				total_matches: results.length,
				returned: limited.length,
				results: limited.map(summarize),
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
				return {
					content: [
						{ type: "text", text: `No ${type} found with id "${id}".` },
					],
					isError: true,
				};
			}
			return {
				content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
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
				"Overall catalogue stats: counts per type, average ratings, latest finished date.",
			inputSchema: {},
		},
		async () => {
			const byType: Record<
				string,
				{ count: number; rating_sum: number; rating_n: number }
			> = {};
			let latest: string | null = null;
			for (const e of entries) {
				byType[e.type] ??= { count: 0, rating_sum: 0, rating_n: 0 };
				const b = byType[e.type]!;
				b.count += 1;
				b.rating_sum += e.rating_number;
				b.rating_n += 1;
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
								total: entries.length,
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
