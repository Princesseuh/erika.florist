use chrono::{DateTime, Datelike, Utc};
use maud::{html, PreEscaped};
use maudit::route::prelude::*;

use crate::layouts::base_layout;

#[derive(Clone)]
struct ChangelogEntry {
    ref_hash: String,
    link: String,
    date: DateTime<Utc>,
    desc: String,
    scope: Option<String>,
    is_catalogue: bool,
}

fn find_workspace_root() -> Option<std::path::PathBuf> {
    // Start from the current executable's directory and walk up looking for the scripts folder
    let mut current = std::env::current_dir().ok()?;

    loop {
        if current.join("scripts/getChangelog.sh").exists() {
            return Some(current);
        }

        if !current.pop() {
            break;
        }
    }

    None
}

fn get_changelog() -> Vec<ChangelogEntry> {
    let workspace_root =
        find_workspace_root().expect("Could not find workspace root with scripts/getChangelog.sh");
    let script_path = workspace_root.join("scripts/getChangelog.sh");

    let output = std::process::Command::new("bash")
        .current_dir(&workspace_root)
        .arg(&script_path)
        .output()
        .expect("Failed to execute getChangelog.sh");

    let raw = String::from_utf8_lossy(&output.stdout);

    raw.split("$END$")
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split("$SEP$").collect();
            if parts.len() < 3 {
                eprintln!(
                    "Failed to parse changelog line: '{}' (found {} parts)",
                    line,
                    parts.len()
                );
                return None;
            }

            let ref_hash = parts[0].trim().to_string();
            let date_str = parts[1].trim();
            let desc = parts[2].trim().to_string();

            // Skip CI entries
            if desc.starts_with("[ci]") {
                return None;
            }

            let date = DateTime::parse_from_rfc3339(date_str)
                .ok()?
                .with_timezone(&Utc);

            let clean_desc = desc
                .replace("[skip ci]", "")
                .replace("[auto]", "")
                .trim()
                .to_string();

            // Parse scope from message (e.g., "content(wiki):" or "feat:")
            let scope = clean_desc.split(':').next().and_then(|prefix| {
                if let Some(start) = prefix.find('(')
                    && let Some(end) = prefix.find(')')
                        && end > start {
                            return Some(prefix[start + 1..end].to_string());
                        }
                None
            });

            let is_catalogue = scope.as_ref().map(|s| s == "catalogue").unwrap_or(false)
                || clean_desc.starts_with("content(catalogue):");

            Some(ChangelogEntry {
                ref_hash: ref_hash.clone(),
                link: format!(
                    "https://github.com/Princesseuh/erika.florist/commit/{}",
                    ref_hash
                ),
                date,
                desc: clean_desc,
                scope,
                is_catalogue,
            })
        })
        .collect()
}

fn get_entry_color_classes(scope: &Option<String>) -> &'static str {
    match scope.as_deref() {
        Some("wiki") => "border-violet-ultra/15 text-violet-ultra hover:bg-violet-ultra hover:text-white-sugar-cane focus:bg-violet-ultra focus:text-white-sugar-cane",
        Some("blog") => "border-accent-valencia/15 text-accent-valencia hover:bg-accent-valencia hover:text-white-sugar-cane focus:bg-accent-valencia focus:text-white-sugar-cane",
        Some("catalogue") => "border-black-charcoal/10 text-black-charcoal/50 hover:bg-black-charcoal hover:text-white-sugar-cane focus:bg-black-charcoal focus:text-white-sugar-cane",
        _ => "border-subtle-charcoal/15 text-subtle-charcoal hover:bg-subtle-charcoal hover:text-white-sugar-cane focus:bg-subtle-charcoal focus:text-white-sugar-cane",
    }
}

#[route("/changelog")]
pub struct ChangelogPage;

impl Route for ChangelogPage {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        let masonry_script = ctx.assets.add_script("src/assets/masonry.ts").unwrap();
        let changelog = get_changelog();

        // Group entries by year
        let mut entries_by_year: std::collections::BTreeMap<i32, Vec<&ChangelogEntry>> =
            std::collections::BTreeMap::new();
        for entry in &changelog {
            let year = entry.date.year();
            entries_by_year.entry(year).or_default().push(entry);
        }

        // Sort years descending (newest first)
        let years: Vec<i32> = entries_by_year.keys().copied().rev().collect();

        let has_catalogue_entries = changelog.iter().any(|e| e.is_catalogue);

        // Build sidebar content for both desktop and mobile
        let sidebar_content = html! {
            div."flex flex-col gap-6" {
                div."flex flex-col gap-2" {
                    span."font-bold text-sm" { "Years" }
                    ul."m-0 flex list-none flex-wrap gap-1 p-0" {
                        @for year in &years {
                            li {
                                a."button-style-bg-accent inline" href=(format!("#year-{}", year)) {
                                    (year)
                                }
                            }
                        }
                    }
                }

                @if has_catalogue_entries {
                    div."flex flex-col gap-2" {
                        span."font-bold text-sm" { "Options" }
                        label."flex items-center gap-2 cursor-pointer" {
                            input type="checkbox" id="toggle-catalogue-checkbox" class="cursor-pointer";
                            span."text-sm" { "Show content changes" }
                        }
                    }
                }
            }
        };

        // Desktop sidebar
        let sidebar = html! {
            aside."hidden sm:block mr-4 grow-0 basis-1/5 sm:my-8" {
                div."top-4 mt-4 flex flex-col items-center gap-y-6 sm:sticky sm:mt-0 sm:items-start" {
                    (sidebar_content)
                }
            }
        };

        base_layout(
            Some("Changelog".into()),
            Some("Things change, and that's okay.".into()),
            html!(
                // Floating filter button for mobile
                button id="mobile-filter-toggle" ."sm:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-accent-valencia text-white-sugar-cane rounded-full p-0 flex items-center justify-center shadow-lg hover:bg-accent-valencia/90 focus:outline-none focus:ring-2 focus:ring-accent-valencia focus:ring-offset-2" aria-label="Toggle filters" {
                    svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                        path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4";
                    }
                }

                // Mobile sidebar overlay
                div id="mobile-filter-sidebar" ."fixed inset-0 bg-black/50 z-50 opacity-0 pointer-events-none transition-opacity sm:hidden" {
                    div."absolute right-0 top-0 h-full w-80 max-w-sm bg-white-sugar-cane overflow-y-auto transform translate-x-full transition-transform" {
                        div."p-6 pt-12" {
                            button id="mobile-filter-close" ."absolute top-4 right-4 text-black-charcoal hover:text-accent-valencia" aria-label="Close filters" {
                                svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {
                                    path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12";
                                }
                            }
                            (sidebar_content)
                        }
                    }
                }

                div."flex flex-col gap-x-4 sm:flex-row" {
                    div."flex-1 mb-8 mx-2 my-4 sm:m-4" {
                        @for (index, year) in years.iter().enumerate() {
                            @if let Some(entries) = entries_by_year.get(year) {
                                // Use details element for collapsible years
                                @if index == 0 {
                                    details."w-full mb-4 changelog-year" open {
                                        summary."button-style-bg-accent w-full text-left px-4 py-3 font-bold text-lg cursor-pointer list-none flex items-center justify-between" id=(format!("year-{}", year)) {
                                            span { (year) }
                                            span."year-arrow transition-transform" { "▶" }
                                        }
                                        div."pt-6" {
                                            div."masonry relative mb-8" {
                                                @for entry in entries.iter() {
                                                    @let color_classes = get_entry_color_classes(&entry.scope);
                                                    @if entry.is_catalogue {
                                                        // Catalogue entries - hidden by default
                                                        div."changelog-entry absolute m-0 catalogue-entry" style="display: none;" {
                                                            a href=(entry.link) class=(format!("group block break-words border border-solid px-4 py-3 font-normal leading-tight {}", color_classes)) {
                                                                span."font-mono text-xs block mb-1" { (entry.ref_hash) }
                                                                span."text-sm" { (entry.desc) }
                                                            }
                                                        }
                                                    } @else {
                                                        // Regular entries - colored by scope
                                                        div."changelog-entry absolute m-0" {
                                                            a href=(entry.link) class=(format!("group block break-words border border-solid px-4 py-3 font-medium leading-tight {}", color_classes)) {
                                                                span."font-mono text-sm block mb-1" { (entry.ref_hash) }
                                                                span."text-sm" { (entry.desc) }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } @else {
                                    details."w-full mb-4 changelog-year" {
                                        summary."button-style-bg-accent w-full text-left px-4 py-3 font-bold text-lg cursor-pointer list-none flex items-center justify-between" id=(format!("year-{}", year)) {
                                            span { (year) }
                                            span."year-arrow transition-transform" { "▶" }
                                        }
                                        div."pt-6" {
                                            div."masonry relative mb-8" {
                                                @for entry in entries.iter() {
                                                    @let color_classes = get_entry_color_classes(&entry.scope);
                                                    @if entry.is_catalogue {
                                                        // Catalogue entries - hidden by default
                                                        div."changelog-entry absolute m-0 catalogue-entry" style="display: none;" {
                                                            a href=(entry.link) class=(format!("group block break-words border border-solid px-4 py-3 font-normal leading-tight {}", color_classes)) {
                                                                span."font-mono text-xs block mb-1" { (entry.ref_hash) }
                                                                span."text-sm" { (entry.desc) }
                                                            }
                                                        }
                                                    } @else {
                                                        // Regular entries - colored by scope
                                                        div."changelog-entry absolute m-0" {
                                                            a href=(entry.link) class=(format!("group block break-words border border-solid px-4 py-3 font-medium leading-tight {}", color_classes)) {
                                                                span."font-mono text-sm block mb-1" { (entry.ref_hash) }
                                                                span."text-sm" { (entry.desc) }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        (masonry_script)
                    }

                    (sidebar)
                }

                (PreEscaped(r##"<style>
                    .changelog-year[open] .year-arrow {
                        transform: rotate(90deg);
                    }
                    .changelog-year summary::-webkit-details-marker {
                        display: none;
                    }
                </style>"##))

                (PreEscaped(r##"<script>
                    document.addEventListener('DOMContentLoaded', () => {
                        // Mobile filter sidebar toggle
                        const filterToggle = document.getElementById('mobile-filter-toggle');
                        const filterSidebar = document.getElementById('mobile-filter-sidebar');
                        const filterClose = document.getElementById('mobile-filter-close');
                        const filterContent = filterSidebar?.querySelector('div');
                        let filterOpen = false;

                        function toggleFilterSidebar() {
                            filterOpen = !filterOpen;
                            
                            if (filterSidebar) {
                                filterSidebar.classList.toggle('opacity-0', !filterOpen);
                                filterSidebar.classList.toggle('opacity-100', filterOpen);
                                filterSidebar.classList.toggle('pointer-events-none', !filterOpen);
                            }
                            
                            if (filterContent) {
                                filterContent.classList.toggle('translate-x-full', !filterOpen);
                                filterContent.classList.toggle('translate-x-0', filterOpen);
                            }
                            
                            document.body.style.overflow = filterOpen ? 'hidden' : '';
                        }

                        if (filterToggle) {
                            filterToggle.addEventListener('click', toggleFilterSidebar);
                        }
                        
                        if (filterClose) {
                            filterClose.addEventListener('click', toggleFilterSidebar);
                        }
                        
                        // Close when clicking overlay
                        if (filterSidebar) {
                            filterSidebar.addEventListener('click', (e) => {
                                if (e.target === filterSidebar) {
                                    toggleFilterSidebar();
                                }
                            });
                        }

                        // Close when clicking year links in mobile sidebar
                        if (filterSidebar) {
                            filterSidebar.addEventListener('click', (e) => {
                                const target = e.target;
                                if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#year-')) {
                                    if (filterOpen) {
                                        toggleFilterSidebar();
                                    }
                                }
                            });
                        }"##))

                @if has_catalogue_entries {
                    (PreEscaped(r##"
                        // Catalogue checkbox handling
                        const checkbox = document.getElementById('toggle-catalogue-checkbox');
                        const catalogueEntries = document.querySelectorAll('.catalogue-entry');

                        if (checkbox && catalogueEntries.length > 0) {
                            checkbox.addEventListener('change', () => {
                                const showCatalogue = checkbox.checked;
                                for (const entry of catalogueEntries) {
                                    entry.style.display = showCatalogue ? '' : 'none';
                                }
                                if (window.recalculateMasonry) {
                                    window.recalculateMasonry();
                                }
                            });
                        }"##))
                }

                (PreEscaped(r##"
                        // Handle year links - open the details element when clicked
                        document.querySelectorAll('a[href^="#year-"]').forEach(link => {
                            link.addEventListener('click', (e) => {
                                const targetId = link.getAttribute('href').substring(1);
                                const summary = document.getElementById(targetId);
                                if (summary) {
                                    const details = summary.closest('details');
                                    if (details && !details.open) {
                                        details.open = true;
                                        setTimeout(() => {
                                            if (window.recalculateMasonry) {
                                                window.recalculateMasonry();
                                            }
                                        }, 0);
                                    }
                                }
                            });
                        });
                    });
                </script>"##))
            ),
            true,
            ctx,
        )
    }
}
