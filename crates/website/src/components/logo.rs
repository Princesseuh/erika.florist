use maud::{Markup, html};
use rand::seq::IndexedRandom;

use crate::components::dinkus;

pub fn logo() -> Markup {
    let mut rng = rand::rng();
    let random_punctuations = ["", "", "", "", "", "", "", "", "", ".", "!", "!"];
    let ponctuation = random_punctuations.choose(&mut rng).unwrap();

    html! {
        h1 class="my-0 text-4xl" {
            a class="whitespace-nowrap fill-white-sugar-cane font-medium text-white-sugar-cane no-underline hover:bg-white-sugar-cane hover:fill-accent-valencia hover:text-accent-valencia" href="/" {
                (dinkus(Some("align-sub mr-2")))
                "erika"
                (ponctuation)
            }
        }
    }
}
