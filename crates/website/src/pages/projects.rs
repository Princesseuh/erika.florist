use maud::{Markup, PreEscaped, html};
use maudit::route::prelude::*;

use crate::{
    components::icon::Icon,
    components::{mobile_menu, project_card, project_meta},
    content::{Project, ProjectRole, ProjectType, has_project_page},
    layouts::base_layout,
};

fn filter_group(label: &str, name: &str, options: &[(&str, &str)]) -> Markup {
    html! {
        div."flex flex-col gap-2" {
            span."font-bold text-sm" { (label) }
            ul."m-0 flex list-none flex-wrap gap-1 p-0" {
                @for (value, option_label) in options {
                    li {
                        button."button-style-bg-accent inline aria-pressed:bg-white-sugar-cane aria-pressed:text-accent-valencia"
                            type="button"
                            data-filter=(name)
                            data-value=(value)
                            aria-pressed=(if value.is_empty() { "true" } else { "false" }) {
                            (option_label)
                        }
                    }
                }
            }
        }
    }
}

fn project_sidebar_content() -> Markup {
    let mut type_options: Vec<(&str, &str)> = vec![("", "All")];
    type_options.extend(
        ProjectType::ALL
            .iter()
            .map(|project_type| (project_type.slug(), project_type.plural())),
    );

    let mut role_options: Vec<(&str, &str)> = vec![("", "Anything")];
    role_options.extend(
        ProjectRole::ALL
            .iter()
            .map(|role| (role.slug(), role.label())),
    );

    html! {
        div."flex flex-col gap-6" data-graphgarden-ignore="" {
            p."text-sm m-0" {
                "Things I made, maintain or contribute to. A good chunk of them happen under "
                a."text-accent-valencia font-[450] hover:bg-accent-valencia hover:text-white-sugar-cane" href="https://bruits.org" { "Bruits" }
                ", the collective I co-founded."
            }
            (filter_group("Category", "type", &type_options))
            (filter_group("Role", "role", &role_options))
            p."hidden text-sm" data-project-empty="" { "Nothing matches those filters." }
        }
    }
}

fn project_sidebar() -> Markup {
    html! {
        aside."hidden sm:block mr-4 grow-0 basis-1/5 sm:my-8" {
            div."top-4 mt-4 flex flex-col items-center gap-y-6 sm:sticky sm:mt-0 sm:items-start" {
                (project_sidebar_content())
            }
        }
    }
}

#[route("/projects")]
pub struct ProjectIndex;

impl Route for ProjectIndex {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/masonry.ts")?;
        ctx.assets.include_script("src/assets/projects.ts")?;

        let mut projects: Vec<_> = ctx.content::<Project>("projects").entries().collect();

        projects.sort_by(|a, b| {
            let a_data = a.data(ctx);
            let b_data = b.data(ctx);

            b_data
                .featured
                .unwrap_or(false)
                .cmp(&a_data.featured.unwrap_or(false))
                .then_with(|| {
                    a_data
                        .archived
                        .unwrap_or(false)
                        .cmp(&b_data.archived.unwrap_or(false))
                })
                .then_with(|| b_data.date.cmp(&a_data.date))
                .then_with(|| {
                    a_data
                        .title
                        .to_lowercase()
                        .cmp(&b_data.title.to_lowercase())
                })
        });

        Ok(base_layout(
            Some("Projects".into()),
            Some("Software, websites and games I made, maintain or contribute to.".into()),
            html!(
                (mobile_menu("projects", project_sidebar_content(), Icon::Menu))

                article."flex flex-col gap-x-4 sm:flex-row" {
                    div."flex-1" {
                        div."masonry relative mx-2 my-4 sm:m-4" id="project-list" {
                            @for project in &projects {
                                (project_card(project, ctx))
                            }
                        }
                    }
                    (project_sidebar())
                }
            ),
            true,
            None,
            ctx,
        ))
    }
}

#[route("/projects/[slug]")]
pub struct ProjectPage;

#[derive(Params, Clone)]
pub struct ProjectPageParams {
    pub slug: String,
}

impl Route<ProjectPageParams> for ProjectPage {
    fn pages(&self, ctx: &mut DynamicRouteContext) -> Pages<ProjectPageParams> {
        let projects = ctx.content::<Project>("projects");

        let documented: Vec<String> = projects
            .entries()
            .filter(|entry| has_project_page(entry))
            .map(|entry| entry.id.clone())
            .collect();

        projects
            .into_pages(|entry| {
                Page::from_params(ProjectPageParams {
                    slug: entry.id.clone(),
                })
            })
            .into_iter()
            .filter(|page| documented.contains(&page.params.slug))
            .collect()
    }

    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let params = ctx.params::<ProjectPageParams>();
        let project = ctx.content::<Project>("projects").get_entry(&params.slug);
        let data = project.data(ctx);

        let title = data.title.clone();
        let tagline = data.tagline.clone();
        let body = project.render(ctx);

        Ok(base_layout(
            Some(title.clone()),
            tagline.clone(),
            html!(
                header."mb-6 mt-0 bg-accent-valencia text-white-sugar-cane" #title {
                    div."mx-4" {
                        div."mx-auto w-centered-width py-8 sm:py-12" {
                            h1."my-0 hyphens-auto text-5xl sm:hyphens-none sm:text-6xl" { (title) }
                            @if let Some(tagline) = &tagline {
                                h2."m-0 mt-4 text-xl" { (tagline) }
                            }
                            div {
                                (project_meta(project, ctx, None, true))
                            }
                        }
                    }
                }

                article."prose relative mx-auto mb-12 w-centered-width px-4" {
                    (PreEscaped(body))
                }
            ),
            false,
            None,
            ctx,
        ))
    }
}
