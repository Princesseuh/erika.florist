import Image from "@11ty/eleventy-img"

export function generateImage(src, options, addBasePath = true) {
  const settings = Object.assign(options, {
    outputDir: "public/assets/images",
    urlPath: "/assets/images",
  })
  src = (addBasePath ? "src/assets" : "") + src
  ;(async () => {
    const data = await Image(src, settings)
  })()

  return Image.statsSync(src, settings)
}
