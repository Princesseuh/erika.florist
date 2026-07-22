use maud::{PreEscaped, html};
use maudit::{assets::StyleOptions, route::prelude::*};

use crate::layouts::base_layout;

// The only scratch-map state in the repo: a sorted JSON array of visited H3 cell IDs
// (resolution is set by the Worker on ingest). Passed straight to the client, which
// draws the fog-of-war overlay with h3-js.
// `include_str!` (compile-time) ensures cargo rebuilds — and Maudit re-renders — when it changes.
const CELLS_JSON: &str = include_str!("../../content/scratchmap/cells.json");

// Neighbourhood/city/country completion, computed in CI by `xtask update-regions`.
const REGIONS_JSON: &str = include_str!("../../content/scratchmap/regions.json");

#[route("/scratchmap/")]
pub struct ScratchMap;

impl Route for ScratchMap {
    fn render(&self, ctx: &mut PageContext) -> impl Into<RenderResult> {
        ctx.assets.include_script("src/assets/scratchmap.ts")?;
        // Leaflet's stylesheet (bundled from npm, not a CDN). tailwind: false — it's
        // vendored CSS, not Tailwind source.
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

                    // Visited cell IDs for the client to reveal (punch holes in the fog).
                    script type="application/json" id="scratchmap-cells" {
                        (PreEscaped(CELLS_JSON.trim()))
                    }

                    // Per-region completion badges, shown by zoom level.
                    script type="application/json" id="scratchmap-regions" {
                        (PreEscaped(REGIONS_JSON.trim()))
                    }
                }
            ),
            true,
            None,
            ctx,
        ))
    }
}
