import { basename, extname } from "path"
export { readableDate } from "./dateTools"

export function getSlugFromFile(path: string): string {
  return basename(path, extname(path))
}
