use std::hash::{DefaultHasher, Hash, Hasher};

use maud::html;
use maudit::{assets::StyleOptions, route::prelude::*};

use crate::layouts::base_layout;
use crate::state;

// Sorted JSON array of visited H3 cell ids. `include_str!` makes cargo rebuild, and
// Maudit re-render, when the data changes.
const CELLS_JSON: &str = include_str!("../../content/scratchmap/cells.json");

// Region completion, computed by `xtask update-regions`.
const REGIONS_JSON: &str = include_str!("../../content/scratchmap/regions.json");

// The region-attribution cache is deliberately *not* shipped: live mode tests the
// region outlines already present in REGIONS_JSON, which is exact and lighter.

fn scratchmap_hash() -> String {
    let mut hasher = DefaultHasher::new();
    CELLS_JSON.hash(&mut hasher);
    REGIONS_JSON.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

// The map data, versioned by its content hash. The page carries only the hash;
// scratchmap-db.ts fetches this once per data change and serves IndexedDB after.
#[route("/scratchmap/content.json")]
pub struct ScratchMapContent;

impl Route for ScratchMapContent {
    fn render(&self, _ctx: &mut PageContext) -> impl Into<RenderResult> {
        let hash = scratchmap_hash();
        let _ = state::set_scratchmap_hash(hash.clone());
        format!(
            "[{:?},{},{}]",
            hash,
            CELLS_JSON.trim(),
            REGIONS_JSON.trim()
        )
    }
}

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

        // Empty on incremental rebuilds where ScratchMapContent stayed cached;
        // scratchmap-db.ts then just refetches content.json.
        let hash = state::get_scratchmap_hash().unwrap_or_default();

        Ok(base_layout(
            Some("Scratch map".into()),
            Some(
                "A map of everywhere I've physically been, revealed one hexagon at a time.".into(),
            ),
            html!(
                div id="scratchmap-frame" class="relative h-[calc(100vh-213px)] md:h-[calc(100vh-255px)]" {
                    // The fog colour as composited over the light basemap. An inline
                    // style outlives Leaflet's own container background, so the page
                    // never flashes white before the tiles and fog paint.
                    div id="scratchmap-map" class="absolute inset-0" style="background:#8e88bc" data-latest=(hash) {}
                }
            ),
            true,
            None,
            ctx,
        ))
    }
}
