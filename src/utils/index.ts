import { basename, extname } from "path"
export { readableDate } from "./dateTools"
export { generateImage } from "./imageTools"

export function getSlugFromFile(path: string): string {
  return basename(path, extname(path))
}

export function getBaseSiteURL(): string {
  return import.meta.env.PROD
    ? "https://hungry-newton-542b56.netlify.app/"
    : "http://localhost:3000"
}
