# erika.florist

Source code for my website, [erika.florist](https://erika.florist)

This website contains [articles I wrote](https://erika.florist/articles), a [list of projects](https://erika.florist/projects) I made, and finally, [a wiki about various things](https://erika.florist/wiki)

## Tech stack

Made using [Astro](https://astro.build), styled using [Tailwind](https://tailwindcss.com/) and the interactive parts are written in [Typescript](https://www.typescriptlang.org/)

### Technical motivations

While I don't necessarily have big ambitions for this website, I'm still trying to make it a good experience, as such, here's a few rules that I (try my best) follow for that purpose:

#### Performance

- Pages should be as lightweight as possible. A page shouldn't initially weight more than 2mb. Heavy content such as images or embeds should be lazy-loaded when possible, otherwise, only loaded on interaction or through a link. Pages should load under 200-300ms on a fast internet and under 2s on much slower internet connections. All in all, that means that:
- Javascript should only be ever used for progressive enhancements or if there's no alternative. The website should work with Javascript disabled or not loaded yet. In cases where that isn't possible, an alternative experience albeit not as complete should be provided

#### Accessibility

- The website should be as accessible as possible, while I unfortunately probably cannot fulfill every needs, low-hanging fruits such as accessible colors, alt texts on images, proper usage of headings are all fairly doable and should be done
