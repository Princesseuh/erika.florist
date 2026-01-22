import matter from "gray-matter";
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import { argv } from "node:process";

const contentStringsToInclude = new Set([
	...["erika", "articles", "projects", "catalogue"].flatMap((str) => str.split("")),
]);

const contentLetters = new Set([...contentStringsToInclude]);
const titleLetters = new Set([..."erika".split("")]);

for await (const entry of glob("crates/website/content/**/*.md")) {
	const { data, content } = matter.read(entry);

	for (const letter of data.title) {
		titleLetters.add(letter);
	}

	if (data.tagline) {
		for (const letter of data.tagline) {
			contentLetters.add(letter);
		}
	}

	for (const letter of content) {
		contentLetters.add(letter);
	}
}

const fontFolder = path.resolve(process.cwd(), "crates", "website", "src", "assets", "fonts");
if (argv.includes("--title")) {
	execSync(
		'fonttools varLib.instancer -q -o "InterResultTemp.woff2" InterOriginal.woff2 wght=600 opsz=32',
		{
			cwd: fontFolder,
		},
	);

	execSync(
		`pyftsubset InterResultTemp.woff2 --text="${Array.from(titleLetters).join(
			"",
		)}" --layout-features="ss08,kern" --flavor="woff2" --output-file="InterResult.woff2"`,
		{
			cwd: fontFolder,
		},
	);

	rmSync(
		path.resolve(
			process.cwd(),
			"crates",
			"website",
			"src",
			"assets",
			"fonts",
			"InterResultTemp.woff2",
		),
	);
}

if (argv.includes("--content")) {
	execSync(
		'fonttools varLib.instancer -q -o "IBMPlexResultTemp.woff2" IBMPlexOriginal.woff2 wght=400:500 wdth=100',
		{
			cwd: fontFolder,
		},
	);

	// Create a temporary file with the subset of characters
	writeFileSync(
		path.resolve(fontFolder, "IBMPlexSubset.txt"),
		Array.from(contentLetters)
			.join("")
			.replaceAll(/\r?\n|\r/g, "")
			.replaceAll(
				/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
				"",
			),
	);

	execSync(
		`pyftsubset IBMPlexResultTemp.woff2 --text-file="IBMPlexSubset.txt" --layout-features="kern" --flavor="woff2" --output-file="IBMPlexResult.woff2"`,
		{
			cwd: fontFolder,
		},
	);

	rmSync(path.resolve(fontFolder, "IBMPlexSubset.txt"));
	rmSync(path.resolve(fontFolder, "IBMPlexResultTemp.woff2"));
}
