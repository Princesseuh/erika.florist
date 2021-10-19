import { BaseObject, postProcessBase } from "./shared"
import { basename, dirname } from "path"

interface Project extends BaseObject {
  type: ProjectType
  title: string
  startDate: Date
  endDate?: Date
  logo?: URL
  miniLogo?: URL
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
  project.url = new URL(`/projects/${project.type}s/${project.slug}`, "http://localhost:3000")
  project.miniLogo = new URL(project.url + "/mini-logo.png")

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
