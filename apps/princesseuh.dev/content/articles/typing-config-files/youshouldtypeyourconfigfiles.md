---
title: Your config files should be typechecked
tagline: aka, How to use the power of Typescript for your Prettier, ESLint and other config files
loadCSSModules: ["code"]
date: 2022-01-12
tags: ["programming", "javascript"]
---

Or maybe not, whatever fits your needs. Personally, I think that definitely not enough people are using TypeScript for their config files, or maybe not a lot of people know that you even can in the first place!

Luckily, we're entering an era of many projects having their config files typechecked as a first-class option, for instance [Vite supports it through three(!) different methods](https://vitejs.dev/config/#config-intellisense), [Astro](https://astro.build) ships typechecked config files in all of its starters and most [projects Anthony Fu has worked on](https://antfu.me/projects) have typechecked config files, [himself being a proponent of typing your config files](https://antfu.me/notes#type-your-config)

However, not every project has caught up yet. Here's an example: Have you ever tried writing by hand an ESLint or Prettier config only to realize that you don't know half of the settings (and their values) it can takes? Well, TypeScript can, and will, help you with that! ✨

Let's see how we can use typed configs with some of the most popular JavaScript tools!

<Blocknote title="On .ts config files and helper methods">

Unfortunately, most tools do not support just using a `.ts` extension or using an helper method, so we'll have to use JSDoc type annotations to achieve this

While this is unfortunate, luckily JSDoc annotations are just as easy to use!

</Blocknote>

## ESLint

First install the [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)'s type definition for [ESLint](https://eslint.org/), `@types/eslint` using your favorite package manager. And then, in your `eslintrc.js` file, write the following

```js
/** @type {import("@types/eslint").Linter.Config */
module.exports = {
  // ... your eslint config here
}
```

And there you go, your ESLint config is now typechecked by TypeScript which also means that you now get suggestions and completions through your editor! It's fun AND interactive!

Let's do the same thing for Prettier!

## Prettier

Similarly to ESLint, first install the types definition for [Prettier](https://prettier.io/) through `@types/prettier` and then add the following to your `.prettierrc.js`

```js
/** @type {import("@types/prettier").Options */
module.exports = {
  // ... your prettier config here
}
```

It's that easy and the benefits are very clear immediately. Frankly, in my opinion it's worth it for the completion alone, so convenient. Let's do more!

## Tailwind

The types available for [Tailwind](https://tailwindcss.com/) are unfortunately not perfect, however, it's still an improvement over nothing

```js
/** @type {import('@types/tailwindcss/tailwind-config').TailwindConfig} */
module.exports = {
  // ... your tailwind config here
}
```

Alternatively to the DefinitelyTyped's types, you can use [the types found here](https://github.com/tailwindlabs/play.tailwindcss.com/blob/master/src/monaco/types-v3.d.ts) which I personally find to be better in most cases. Hopefully one day the Tailwind team will provide official type definitions ([GitHub discussion about that here](https://github.com/tailwindlabs/tailwindcss/discussions/1077))

## Bonus: Astro

As said in the intro of this article, Astro starters are all using Typescript for their config file through a JSDoc comment, but we can do even better by directly using a .ts file!

```ts
import type { AstroUserConfig } from "astro"

const config: AstroUserConfig = {
  // ... your astro config here
}

export default config
```
