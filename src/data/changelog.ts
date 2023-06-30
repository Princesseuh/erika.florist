import { execSync } from "node:child_process";

const changelogRaw = execSync("bash ./scripts/getChangelog.sh")
  .toString()
  .split("$END$")
  .slice(0, -1);

export type ChangelogEntry = {
  ref: string;
  date: Date;
  desc: string;
};

export type Changelog = ChangelogEntry[];

export function getChangelog(): Changelog {
  return changelogRaw.flatMap((line) => {
    const [ref, date, desc] = line.split("$SEP$");

    if (!ref || !date || !desc) {
      throw new Error("Couldn't parse file info from " + line);
    }

    return {
      ref: ref.trim(),
      date: new Date(date),
      desc: desc.replace("$END$", ""),
    };
  });
}
