import { execSync } from "node:child_process";

const changelogRaw = execSync("bash ./scripts/getChangelog.sh")
	.toString()
	.split("$END$")
	.slice(0, -1);

export interface ChangelogEntry {
	ref: string;
	link: string;
	date: Date;
	desc: string;
}

export type Changelog = ChangelogEntry[];

export function getChangelog(): Changelog {
	return changelogRaw
		.flatMap((line) => {
			const [ref, date, desc] = line.split("$SEP$");

			if (!ref || !date || !desc) {
				throw new Error("Couldn't parse file info from " + line);
			}

			const trimmedRef = ref.trim();
			return {
				ref: trimmedRef,
				link: `https://github.com/Princesseuh/erika.florist/commit/${trimmedRef}`,
				date: new Date(date),
				desc: cleanChangelogDescription(desc.replace("$END$", "")),
			};
		})
		.filter((entry) => !entry.desc.startsWith("[ci]"));
}

function cleanChangelogDescription(desc: string): string {
	return desc.replace("[skip ci]", "").replace("[auto]", "").trim();
}
