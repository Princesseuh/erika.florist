use std::fmt::Write as _;

use h3o::CellIndex;
use maud::{PreEscaped, html};
use maudit::{assets::StyleOptions, route::prelude::*};

use crate::layouts::base_layout;

// The only scratch-map state in the repo: a sorted list of visited H3 cell IDs
// (resolution is set by the Worker on ingest).
// `include_str!` (compile-time) ensures cargo rebuilds — and Maudit re-renders — when it changes.
const CELLS_JSON: &str = include_str!("../../content/scratchmap/cells.json");

// Average area of an H3 resolution-11 cell, in m².
const RES11_HEX_AREA_M2: f64 = 2150.6;

/// Build a compact JSON array of hex outlines — `[[[lat,lng], …], …]` — one ring
/// per visited cell, for Leaflet to draw. Antimeridian-straddling hexes are skipped.
fn hexes_json(cells: &[CellIndex]) -> String {
    let mut out = String::from("[");
    let mut first = true;
    for cell in cells {
        let boundary = cell.boundary();

        let (mut min_lng, mut max_lng) = (f64::MAX, f64::MIN);
        for vertex in boundary.iter() {
            min_lng = min_lng.min(vertex.lng());
            max_lng = max_lng.max(vertex.lng());
        }
        if max_lng - min_lng > 180.0 {
            continue;
        }

        if !first {
            out.push(',');
        }
        first = false;

        out.push('[');
        for (i, vertex) in boundary.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            let _ = write!(out, "[{:.5},{:.5}]", vertex.lat(), vertex.lng());
        }
        out.push(']');
    }
    out.push(']');
    out
}

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

        let cells: Vec<CellIndex> = serde_json::from_str::<Vec<String>>(CELLS_JSON)
            .unwrap_or_default()
            .iter()
            .filter_map(|id| id.parse::<CellIndex>().ok())
            .collect();

        let count = cells.len();
        let area_m2 = count as f64 * RES11_HEX_AREA_M2;

        Ok(base_layout(
            Some("Scratch map".into()),
            Some(
                "A map of everywhere I've physically been, revealed one hexagon at a time.".into(),
            ),
            html!(
                div."relative h-[calc(100vh-213px)] md:h-[calc(100vh-255px)]" {
                    div id="scratchmap-map" class="absolute inset-0 bg-white-sugar-cane" {}

                    // Hex outlines for the client to draw over the tiles.
                    script type="application/json" id="scratchmap-hexes" {
                        (PreEscaped(hexes_json(&cells)))
                    }

                    // Caption overlay, above the map (Leaflet panes/controls sit below z-[1000]).
                    div."absolute top-3 left-3 z-[1000] max-w-xs rounded-sm border border-black-charcoal/10 bg-white-sugar-cane/90 px-3 py-2 pointer-events-none" {
                        h1."text-lg font-semibold leading-tight" { "Scratch map" }
                        p."text-xs text-subtle-charcoal mt-0.5" {
                            "Everywhere I've physically been, revealed one street-level hexagon "
                            "(~50 m) at a time. Updated automatically from my phone."
                        }
                        p."text-xs text-subtle-charcoal font-mono mt-1" {
                            @if count == 0 {
                                "Nothing discovered yet."
                            } @else {
                                (count) " hexagon" (if count == 1 { "" } else { "s" })
                                " · ~" (format_area(area_m2))
                            }
                        }
                    }
                }
            ),
            true,
            None,
            ctx,
        ))
    }
}

/// Format an area in m², switching to km² once it's large enough to warrant it.
fn format_area(area_m2: f64) -> String {
    if area_m2 >= 1_000_000.0 {
        format!(
            "{} km²",
            group_digits((area_m2 / 1_000_000.0).round() as u64)
        )
    } else {
        format!("{} m²", group_digits(area_m2.round() as u64))
    }
}

/// Group thousands with a thin space (e.g. `1 234 567`).
fn group_digits(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    let len = digits.len();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (len - i).is_multiple_of(3) {
            out.push('\u{202f}');
        }
        out.push(ch);
    }
    out
}
