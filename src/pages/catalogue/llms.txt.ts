import type { APIRoute } from "astro";
import { catalogueContent } from "./content.json";

export const GET = (() => {
	const grouped = catalogueContent.reduce(
		(acc, entry) => {
			const { type, title, rating } = entry.data;
			acc[type] ??= [];
			acc[type].push(`${title} ${rating}`);
			return acc;
		},
		{} as Record<string, string[]>,
	);

	const responseBody = Object.entries(grouped)
		.map(([type, items]) => `${type}\n${items.join("\n")}`)
		.join("\n\n");

	return new Response(responseBody, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=0, must-revalidate, stale-while-revalidate=3600",
		},
	});
}) satisfies APIRoute;
