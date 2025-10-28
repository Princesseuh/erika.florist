import matter from "gray-matter";
import { bold } from "kleur/colors";
import fs from "node:fs";
import path from "node:path";
import { getContentDirs, Logger } from "./catalogueUtils";

export function getLetterboxdCSV(): string {
	const movieDirs = getContentDirs("movies");
	const tmdbIds: string[] = [];

	Logger.info(`Processing ${movieDirs.length} movies...`);

	for (const movieDir of movieDirs) {
		const dirBasename = path.basename(decodeURI(movieDir.pathname));

		try {
			Logger.info(`Getting tmdb id for movies/${bold(dirBasename)}...`);
			const markdownContent = fs.readFileSync(new URL(`${dirBasename}.md`, movieDir)).toString();

			const frontmatter = matter(markdownContent).data;
			const tmdbId = frontmatter.tmdb;

			if (tmdbId) {
				tmdbIds.push(tmdbId.toString());
				Logger.info(`Found TMDB ID: ${tmdbId} for ${dirBasename}`);
			} else {
				Logger.warn(`No TMDB ID found for ${dirBasename}`);
			}
		} catch (error) {
			Logger.error(
				`Failed to process ${dirBasename}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Create CSV content
	const csvContent = ["tmdbID", ...tmdbIds].join("\n");

	Logger.success(`Generated CSV with ${tmdbIds.length} movie IDs`);
	return csvContent;
}

// If running this script directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
	try {
		const csv = getLetterboxdCSV();

		// Write to file
		const outputPath = path.join(process.cwd(), "letterboxd-export.csv");
		fs.writeFileSync(outputPath, csv);

		Logger.success(`CSV exported to: ${outputPath}`);
		console.log("\nPreview:");
		console.log(csv.split("\n").slice(0, 10).join("\n"));
		if (csv.split("\n").length > 10) {
			console.log(`... and ${csv.split("\n").length - 10} more entries`);
		}
	} catch (error) {
		Logger.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
