use maud::{html, Markup};
use rand::seq::IndexedRandom;

use crate::components::dinkus;

pub fn logo() -> Markup {
    let mut rng = rand::rng();
    let random_punctuations = ["", "", "", "", "", "", "", "", "", ".", "!", "!"];
    let ponctuation = random_punctuations.choose(&mut rng).unwrap();

    html! {
        h1 class="my-0" {
            a class="whitespace-nowrap fill-white-sugar-cane text-4xl font-medium text-white-sugar-cane no-underline hover:bg-white-sugar-cane hover:fill-accent-valencia hover:text-accent-valencia" href="/" {
                (dinkus(Some("align-sub mr-2")))
                "erika"
                (ponctuation)
            }
        }
    }
}
