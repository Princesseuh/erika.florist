use maud::{PreEscaped, html};
use maudit::{assets::StyleOptions, route::prelude::*};

use crate::layouts::base_layout;

// Sorted JSON array of visited H3 cell ids. `include_str!` makes cargo rebuild, and
// Maudit re-render, when the data changes.
const CELLS_JSON: &str = include_str!("../../content/scratchmap/cells.json");

// Region completion, computed by `xtask update-regions`.
const REGIONS_JSON: &str = include_str!("../../content/scratchmap/regions.json");

// Parent cell → region, so the live view attributes new cells with the CI lookup.
const REGIONS_CACHE_JSON: &str = include_str!("../../content/scratchmap/regions-cache.json");

#[route("/scratchmap/")]
pub struct ScratchMap;

impl Route for ScratchMap {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/scratchmap.ts")?;
        // tailwind: false — vendored CSS, not Tailwind source.
        ctx.assets.include_style_with_options(
            "../../node_modules/leaflet/dist/leaflet.css",
            StyleOptions { tailwind: false },
        )?;

        Ok(base_layout(
            Some("Scratch map".into()),
            Some(
                "A map of everywhere I've physically been, revealed one hexagon at a time.".into(),
            ),
            html!(
                div id="scratchmap-frame" class="relative h-[calc(100vh-213px)] md:h-[calc(100vh-255px)]" {
                    div id="scratchmap-map" class="absolute inset-0 bg-white-sugar-cane" {}

                    script type="application/json" id="scratchmap-cells" {
                        (PreEscaped(CELLS_JSON.trim()))
                    }

                    script type="application/json" id="scratchmap-regions" {
                        (PreEscaped(REGIONS_JSON.trim()))
                    }

                    script type="application/json" id="scratchmap-regions-cache" {
                        (PreEscaped(REGIONS_CACHE_JSON.trim()))
                    }

                }
            ),
            true,
            None,
            ctx,
        ))
    }
}
