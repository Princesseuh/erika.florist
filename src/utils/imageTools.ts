import Image from "@11ty/eleventy-img"

export function generateImage(
  src: string,
  options,
  addBasePath = true,
): Record<string, ImageFormat[]> {
  const settings = Object.assign(options, {
    outputDir: "public/assets/images",
    urlPath: "/assets/images",
  })
  src = (addBasePath ? "src/assets" : "") + src
  ;(async () => {
    await Image(src, settings)
  })()

  return Image.statsSync(src, settings)
}

export interface ImageFormat {
  format: string
  width: number
  height: number
  filename: string
  outputPath: string
  url: string
  sourceType: string
  srcset: string
  size: number
}
