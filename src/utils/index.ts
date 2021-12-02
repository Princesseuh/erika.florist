import { basename, extname } from "path"
export { readableDate } from "./date"

export function getSlugFromFile(path: string): string {
  return basename(path, extname(path))
}
