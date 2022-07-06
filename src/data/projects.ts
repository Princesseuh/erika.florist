import { BaseFrontmatter } from "./shared"
import { basename, dirname } from "path"
import { getBaseSiteURL, getSlugFromFile } from "$utils"

import { generateImage, ImageFormat } from "astro-eleventy-img"

interface Project extends BaseFrontmatter {
  type: ProjectType
  title: string
  tagline: string
  startDate: Date
  endDate?: Date
  assets: {
    logo?: URL
    indexCover?: string
    miniLogo?: string
  }
  indexCoverAlt?: string
  miniLogoAlt?: string
  githubRepo?: URL
  featured: boolean
  external_url?: string
}

enum ProjectType {
  GAME = "game",
  WEBSITE = "website",
  SOFTWARE = "software",
}

function postProcessProject(project: Project, file: string): Project {
  project.slug = getSlugFromFile(file)
  project.type = getProjectTypeFromURL(file)

  const projectBaseDir = `/projects/${project.type}s/${project.slug}/`
  project.url = project.external_url
    ? new URL(project.external_url)
    : new URL(projectBaseDir, getBaseSiteURL())

  // Assets
  project.assets = {}

  if (project.featured) {
    const indexCover: Record<string, Array<ImageFormat>> = generateImage(
      "content/assets" + projectBaseDir + "cover.png",
      {
        outputDir: "static/assets/images",
        widths: [380, 600],
        formats: ["avif", "webp", "jpeg"],
      },
    )

    project.assets.indexCover = `<picture>
    ${Object.values(indexCover)
      .map(
        (imageFormat) =>
          `  <source type="${imageFormat[0].sourceType}" srcset="${imageFormat
            .map((entry) => entry.srcset)
            .join(", ")}">`,
      )
      .join("\n")}
      <img
        class="object-cover object-top rounded-sm"
        src="${indexCover.jpeg[0].url}"
        width="377"
        height="180"
        alt="${project.indexCoverAlt}"
        decoding="async">
    </picture>`
  }

  const miniLogo: Record<string, Array<ImageFormat>> = generateImage(
    "content/assets" + projectBaseDir + "mini-logo.png",
    {
      outputDir: "static/assets/images",
      widths: [128, 96],
      formats: ["avif", "webp", "png"], // We need transparency on those so can't use jpegs
    },
  )

  project.assets.miniLogo = `<picture>
    ${Object.values(miniLogo)
      .map(
        (imageFormat) =>
          `  <source type="${imageFormat[0].sourceType}" srcset="${imageFormat
            .map((entry) => entry.srcset)
            .join(", ")}">`,
      )
      .join("\n")}
      <img
        class="w-[48px] h-[48px] mr-4"
        src="${miniLogo.png[0].url}"
        width="48"
        height="48"
        alt="${project.miniLogoAlt}"
        loading="lazy"
        decoding="async">
    </picture>`

  // HACK: Workaround an Astro bug regarding dates in frontmatter, see data/articles.ts for more info
  if (typeof project.startDate === "string") {
    project.startDate = new Date(project.startDate)
  }

  if (typeof project.endDate === "string") {
    project.endDate = new Date(project.endDate)
  }

  return project
}

function getProjectTypeFromURL(path: string): ProjectType {
  return basename(dirname(path)).slice(0, -1) as ProjectType
}

export { Project, ProjectType, postProcessProject }
