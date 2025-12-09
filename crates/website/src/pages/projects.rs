use maud::html;
use maudit::route::prelude::*;

use crate::{
    content::{Project, ProjectType},
    layouts::base_layout,
};

#[route("/projects")]
pub struct ProjectIndex;

impl Route for ProjectIndex {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let projects = ctx.content.get_source::<Project>("projects");

        let project_per_types = projects
            .entries
            .iter()
            .fold(
                std::collections::BTreeMap::<&ProjectType, Vec<&Entry<Project>>>::new(),
                |mut acc, project| {
                    acc.entry(&project.data(ctx).r#type)
                        .or_default()
                        .push(project);
                    acc
                },
            )
            .into_iter()
            .map(|(project_type, mut projects)| {
                // Sort projects: featured > date > alphabetic
                projects.sort_by(|a, b| {
                    let a_data = a.data(ctx);
                    let b_data = b.data(ctx);

                    // First, sort by featured (featured projects first)
                    match (
                        a_data.featured.unwrap_or(false),
                        b_data.featured.unwrap_or(false),
                    ) {
                        (true, false) => std::cmp::Ordering::Less,
                        (false, true) => std::cmp::Ordering::Greater,
                        _ => {
                            // If both have same featured status, sort by date (newest first)
                            match (a_data.date.as_ref(), b_data.date.as_ref()) {
                                (Some(a_date), Some(b_date)) => b_date.cmp(a_date),
                                (Some(_), None) => std::cmp::Ordering::Less,
                                (None, Some(_)) => std::cmp::Ordering::Greater,
                                _ => {
                                    // If both have same date status, sort alphabetically by title
                                    a_data.title.cmp(&b_data.title)
                                }
                            }
                        }
                    }
                });
                (project_type, projects)
            })
            .collect::<std::collections::BTreeMap<_, _>>();

        base_layout(
            Some("Projects".into()),
            Some("A list of my projects".into()),
            html!(
                div."container mx-auto my-8 px-4" {
                    @for (project_type, projects) in &project_per_types {
                        div."mb-4" {
                            h2."text-xl font-semibold mb-2" {
                                (format!("{project_type:?}s"))
                            }
                            div."flex flex-wrap gap-4" {
                                @for project in projects {
                                    @let project_data = project.data(ctx);
                                    @let is_featured = project_data.featured.unwrap_or(false);
                                    a."group block w-full sm:w-64 p-4 hover:bg-accent-valencia hover:text-white-sugar-cane focus:bg-accent-valencia focus:text-white-sugar-cane flex flex-col justify-center".(if is_featured {"bg-orange-carrot/8"} else {"border border-solid border-accent-valencia/10"}) href=(project_data.external_url.as_deref().unwrap_or(&format!("/projects/{}", project.id))) {
                                        h3."font-medium text-lg break-words hyphens-auto text-accent-valencia group-hover:text-white-sugar-cane group-focus:text-white-sugar-cane mb-1" { (project_data.title) }
                                        @if let Some(tagline) = &project_data.tagline {
                                            p."text-sm font-medium leading-tight text-black-charcoal group-hover:text-white-sugar-cane group-focus:text-white-sugar-cane my-0" { (tagline) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            ),
            true,
            ctx,
        )
    }
}

#[route("/projects/[slug]")]
pub struct ProjectPage;

struct ProjectPageParams {
    pub slug: String,
}

impl Route for ProjectPage {
    fn render(&self, _: &mut PageContext) -> impl Into<RenderResult> {
        "something"
    }
}
