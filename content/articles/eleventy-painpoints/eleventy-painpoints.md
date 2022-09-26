---
title: "Eleventy pain points"
tagline: "In an unsurprising turns of event, it turns out you really can't write any kind of software without at least a few things going wrong"
date: 2020-10-18
tags: ["eleventy", "website", "programming"]
---

<Blocknote title="Outdated article">

I ended up not using Eleventy at all for the final version of this website, I LOVED using it and would definitely use it on other projects however

For this, I preferred to use something a bit more.. modern than Eleventy and [Astro](https://astro.build/) ended up being really fun, so much that [I started working there](https://twitter.com/_princesseuh/status/1510012848394625030) 😅

</Blocknote>

During the development of this version of my website I encountered a few pain points with [Eleventy](https://www.11ty.dev/), the static site generator used for this website. But that's okay, things take time to make and I'm glad it exists because outside of those few points, it was really really fun to use

Please note that this article was written progressively while making the website so some points are not necessarily still relevant to the final product nor to the current state of the projects used

## Issues

### [eleventy-plugin-vue](https://github.com/11ty/eleventy-plugin-vue)

- `eleventy-plugin-vue` requires `rollup-plugin-vue` 5.1.9 which does not support [PostCSS](https://postcss.org/) 8 so plugins depending on that (notably `postcss-nested` in my case) fails to work

- `eleventy-plugin-vue` does not support using .vue files as layouts. See [this issue](https://github.com/11ty/eleventy-plugin-vue/issues/5)

Due to the second issue, I ended up going with [Nunjucks](https://www.11ty.dev/docs/languages/nunjucks/) instead of Vue, it's cool. I'm still really interested in using Vue with Eleventy so maybe in the future once `eleventy-plugin-vue` is mature enough I'll switch to it

### CSS

- Compared to the rest of Eleventy, I found CSS (with proper code splitting, support for PostCSS/Sass etc) to be a bit difficult to use. The actual usage isn't really that complicated as much as I had trouble finding good documentation for it

I ended up using a static css file (that goes through PostCSS and then get minified by [csso](https://github.com/css/csso)) for the base shared style and [eleventy-assets](https://github.com/11ty/eleventy-assets) for pages that needed unique CSS. `eleventy-assets` is a relatively new project so this bring us to...

### [eleventy-assets](https://github.com/11ty/eleventy-assets)

- I couldn't figure out how to load files from the `_includes` folder so I placed my css files in another folder, that's okay

- I couldn't get the CSS in components to hot-reload, it detects the change (thanks to the watch target we add ourselves, as noted in the docs) but the browser doesn't refresh. Switching to `.eleventy.js` and hitting CTRL+S works as a workaround

Apart from those two issues, working with `eleventy-assets` was really pleasant. Cool stuff

### Markdown

- By default, Eleventy didn't hot reload if changes were made to markdown files that are in a nested folder (for instance for this article). I had to manually add a watch target pointing to the folder where my articles are contained (`articles`). Felt a bit unintuitive, in general it seems like the livereload in Eleventy a bit shaky no matter what kind of content you're editing

These last few years, it seems like the JS ecosystem is just now discovering that long build times are painful for writing content (May [Vite](https://github.com/vuejs/vite) and [Vitepress](https://github.com/vuejs/vitepress) saves us all) however, I must admit that Eleventy does a pretty good job at that, currently build times are around 1-2 seconds for the entire website

It's clearly no [Hugo](https://gohugo.io/) or [Zola](https://www.getzola.org/) but it's good enough for me (and refreshing coming from [Gridsome](https://gridsome.org/))

### [eleventy-plugin-footnotes](https://github.com/HugoGiraudel/eleventy-plugin-footnotes)

I wanted to use footnotes on the wiki and quickly discovered that footnotes are not available in Eleventy by default, that's fine. [An official plugin exist for markdown-it itself](https://github.com/markdown-it/markdown-it-footnote), however while the syntax is really good (thanks to using the base Markdown one) [it's not as good for accessibility](https://hugogiraudel.com/2020/12/02/footnotes-in-11ty/) so I used the plugin made by the author of the article just linked. It's really good but:

- The syntax is really unwieldy compared to the one by the markdown-it plugin, I generally don't like writing my footnotes in the middle of my content. This can by bypassed by putting the content of the footnote in a variable and putting that in the declaration but that's still really cumbersome compared to a more integrated solution

- The plugin doesn't allow us to postprocess the content outside of using filters directly in the markdown, the only postprocessing I would like to do is making it go through markdown-it since by default, it's just raw text

All in all, it works but it's annoying to use. But that's a price I'm willing to pay for better accessibility. The plugin isn't that complicated so I could technically make my own version but that's a lot of work for minor things

## In Resume

Apart from those few problems (which, all things considered are all pretty minors), I had a lot of fun using Eleventy. It's really refreshing to use a simple yet still fully-featured static website generator for once

Some things are definitely harder to do using Eleventy than others generators but overall, it has just the right amount of magic so that it's really fun to use yet it's not magic enough that you feel like you're not in control. I'm not sure if that make sense, maybe it doesn't, but it does to me ha!

In a way, it kinda reminds me of [Arch Linux](https://archlinux.org/)? As in, it's "simple" yet it can be hard to get into but once you know your stuff, everything works just as you want it to

Anyway, I liked using Eleventy, it was cool
