use maud::{Markup, html};
use maudit::{errors::AssetError, route::PageContext};

use crate::components::icon::{Icon, icon};

pub fn go_back_up(ctx: &mut PageContext) -> Result<Markup, AssetError> {
    ctx.assets.include_script("src/assets/go-back-up.ts")?;

    Ok(html! {
        button id="go-up" title="Scroll to top" {
            (icon(Icon::ArrowUp, 28, ""))
        }
    })
}
