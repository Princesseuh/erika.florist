import type { APIRoute } from "astro";
import { versionHash } from "./content.json";

export const GET = (() => {
	return new Response(versionHash);
}) satisfies APIRoute;
