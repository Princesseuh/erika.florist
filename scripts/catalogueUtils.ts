import { gray, yellow } from "kleur/colors";
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

export const Logger = {
  log: (...args: any[]) => console.log(Logger.printDate(), args.join(" ")),
  error: (...args: any[]) => console.error(Logger.printDate(), args.join(" ")),
  warn: (...args: any[]) =>
    console.warn(Logger.printDate(), [yellow("WARNING"), ...args].join(" ")),
  info: (...args: any[]) => console.info(Logger.printDate(), args.join(" ")),
  debug: (...args: any[]) => console.debug(Logger.printDate(), args.join(" ")),
  printDate: () => gray(`[${dt.format(new Date())}]`),
};
