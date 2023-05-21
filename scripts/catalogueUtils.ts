import { bold, gray, green, red, yellow } from "kleur/colors";
import fs from "node:fs";

export function getContentDirs(type: "games" | "books"): URL[] {
  const dirPath = new URL(`../src/content/${type}/`, import.meta.url);
  const dirs = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((dir) => dir.isDirectory())
    .map((dir) => new URL(dir.name + "/", dirPath));

  return dirs;
}

const dt = new Intl.DateTimeFormat("en-gb", {
  hour: "2-digit",
  minute: "2-digit",
});

const isSilent = process.argv.includes("--silent");
export const Logger = {
  success: (...args: string[]) => console.log(Logger.printDate(), bold(green("SUCCESS")), ...args),
  error: (...args: string[]) => console.error(Logger.printDate(), bold(red("ERROR")), ...args),
  warn: (...args: string[]) => console.warn(Logger.printDate(), bold(yellow("WARNING")), ...args),
  info: (...args: string[]) =>
    !isSilent ? console.info(Logger.printDate(), bold(gray("INFO")), ...args) : null,
  printDate: () => gray(`[${dt.format(new Date())}]`),
};
