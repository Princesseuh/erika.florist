use std::fmt::Display;

use maud::{html, Markup};

pub fn tags<S: AsRef<str> + Display>(tag_list: &[S], accent_background: Option<bool>) -> Markup {
    let accent_background = accent_background.unwrap_or(false);

    html! {
        " · "
        @for (i, tag) in tag_list.iter().enumerate() {
            a.(if accent_background { "text-white-sugar-cane hover:bg-white-sugar-cane hover:text-accent-valencia" } else { "text-accent-valencia hover:bg-accent-valencia hover:text-white-sugar-cane" })."hover:group-hover:text-val font-[450] group-focus-within:text-white-sugar-cane group-focus-within:focus:text-black-charcoal group-hover:text-white-sugar-cane group-hover:hover:bg-white-sugar-cane group-hover:hover:text-accent-valencia"
                href=(format!("/articles/tags/{}", tag))
                title=(format!("See all articles tagged with \"{}\"", tag))
                { (tag) }
            @if i < tag_list.len() - 1 {
                ", "
            }
        }
    }
}
