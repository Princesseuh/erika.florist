import { basename, extname } from "path"
export { readableDate } from "./dateTools"
export { generateImage, ImageFormat } from "./imageTools"

export function getSlugFromFile(path: string): string {
  return basename(path, extname(path))
}

export function getBaseSiteURL(): string {
  return import.meta.env.PROD ? "https://princesseuh.netlify.app/" : "http://localhost:3000/"
}
