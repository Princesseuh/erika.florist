import { BaseObject, postProcessBase } from "./shared"
import { basename, dirname } from "path"
import { getBaseSiteURL, generateImage, ImageFormat } from "$utils"

interface Project extends BaseObject {
  type: ProjectType
  title: string
  startDate: Date
  endDate?: Date
  assets?: {
    logo?: URL
    indexCover?: string
    miniLogo?: string
  }
  indexCoverAlt?: string
  miniLogoAlt?: string
  githubRepo?: URL
  featured: boolean
}

enum ProjectType {
  GAME = "game",
  WEBSITE = "website",
  SOFTWARE = "software",
}

function postProcessProject(project: Project): Project {
  project = postProcessBase(project) as Project

  project.type = getProjectTypeFromURL(project.file.pathname)

  const projectBaseDir = `/projects/${project.type}s/${project.slug}/`
  project.url = new URL(projectBaseDir, getBaseSiteURL())

  // Assets
  project.assets = {}

  if (project.featured) {
    const indexCover: Record<string, Array<ImageFormat>> = generateImage(
      projectBaseDir + "cover.png",
      {
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
        loading="lazy"
        decoding="async">
    </picture>`
  }

  const miniLogo: Record<string, Array<ImageFormat>> = generateImage(
    projectBaseDir + "mini-logo.png",
    {
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

  // NOTE: Workaround an Astro bug regarding dates in frontmatter, see data/articles.ts for more info
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
