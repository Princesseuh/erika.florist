import Image from "@11ty/eleventy-img"

interface ImageFormat {
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

function generateImage(src: string, options, addBasePath = true): Record<string, ImageFormat[]> {
  const settings = Object.assign(options, {
    outputDir: "static/assets/images",
    urlPath: "/assets/images",
  })
  src = (addBasePath ? "content/assets" : "") + src
  ;(async () => {
    try {
      await Image(src, settings)
    } catch (error) {
      console.error(error)
    }
  })()

  return Image.statsSync(src, settings)
}

export { ImageFormat, generateImage }
