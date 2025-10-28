---
title: Introducing Maudit
tagline: Something wicked this way comes
date: 2025-10-06
tags: ["programming", "maudit"]
---

Two things about me: I have been using static website generators for more than a decade now, from [Sphinx](https://www.sphinx-doc.org/en/master/) to [Hugo](https://gohugo.io) to [Eleventy](https://www.11ty.dev/) and finally to [Astro](https://astro.build/) (where I work!) and many more. Secondly, I only blog rarely.

So this was inevitable: I made my own static website generator.

> This article is mostly about my own experience on building Maudit. For an actual introduction to the project, [check the corresponding article on Maudit's website.](https://maudit.org/news/maudit01)

## Why?

Mostly those three reasons:

- For fun, honestly
- Learning experience
- I want to lead a """big""" public project

I am, for the most part, not dissatisfied with the current offerings. Before today, this website was built with Astro and it worked nicely. A lot of it is just wanting something new, I think.

## A different model for static site generators

Most static site generators work like this: you install a package or binary, follow some conventions (file-based routing, a config file, templates, etc), then run the tool which assembles all of that into a static site. There’s no `main.js` or entry point your program starts from, it's all internal to the tool.

That model works fine, but I wanted to explore an alternative: [a static site generator that’s a library, not a framework](https://maudit.org/docs/philosophy/#maudit-is-a-library-not-a-framework). In Maudit, everything is just Rust. Pages are plain structs, functions are plain.. functions, and the project is just a normal Rust crate with Maudit in its `Cargo.toml`.

Maudit includes [a built-in entry point](https://maudit.org/docs/entrypoint/) for the typical pages -> HTML use case, but you can just as easily [write your own](https://maudit.org/docs/library/) or embed Maudit inside another Rust program.

### Benefits of that thought

My biggest hope is that this ultimately allow for more flexiblity and freedom without needing for plugins or dedicated APIs. If you want to do something before the build, or after the build, no need for hooks, just call the function wherever you need. 

If you want to render some random Markdown string, just call.. [`render_markdown`](https://docs.rs/maudit/latest/maudit/content/markdown/fn.render_markdown.html). You shouldn't feel like everything needs to fit how the framework works.

### Difficulties of that thought

Of course, this approach also has drawbacks. Rust is a compiled language, so while final builds are fast, the edit–preview cycle is slower than in other frameworks whenever recompilation is needed.

Still, [as I explain on the Maudit blog](https://maudit.org/news/maudit-compile-time/), it’s not as bad as it seems: you can push more work to runtime, build times are not too bad (<3s typically), and if your changes only affect things loaded at runtime (Markdown, CSS, images, etc.), you don’t need to recompile at all.

Maudit also includes a dev server that rebuilds and refreshes automatically whenever a file is changed, so the experience is pretty smooth, and will only get better with time.

## Come join me

It's still relatively early, but Maudit is most definitely already usable (proof, this website). I’m actively working on it and I'd love for you to check it out. If you’re interested, [check out the project's website](https://maudit.org), join the [Discord server](https://maudit.org/chat) or read the code and star on [GitHub](https://github.com/bruits/maudit).
