import { basename, extname } from "path"
export { readableDate } from "./dateTools"

export function getSlugFromFile(path: string): string {
  return basename(path, extname(path))
}

export function getBaseSiteURL(): string {
  return import.meta.env.PROD ? "https://erika.florist/" : "http://localhost:3000/"
}