use maud::{Markup, PreEscaped};

pub fn dinkus(classes: Option<&str>) -> Markup {
    let classes = format!(
        "dinkus {}",
        classes.unwrap_or("mx-auto my-8 block fill-black-charcoal")
    );

    PreEscaped(
        include_str!("./dinkus.svg")
            .replace("CLASSES", &classes)
            .trim()
            .to_owned(),
    )
}
