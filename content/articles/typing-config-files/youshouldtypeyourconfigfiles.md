---
title: Your config files should be typechecked
tagline: aka, How to use the power of Typescript for your Prettier, ESLint and other config files
loadCSSModules: ["code"]
date: 2022-01-12
tags: ["programming", "javascript"]
setup: |
  import Image from '$components/MarkdownImage.astro';
  import Blocknote from "$components/MarkdownNoteBlock.astro";
---

Or maybe not, whatever fits your needs. Personally, I think that definitely not enough people are using TypeScript for their config files, or maybe not a lot of people know that you even can in the first place!

Have you ever tried writing by hand an ESLint or Prettier config only to realize that you don't know half of the settings (and their values) it can takes? TypeScript can help you with that! Let's first see how to do it with ESLint

<Blocknote title="On .ts config files">
Unfortunately, most tools do not support just using a `.ts` extension and going on with your day, so we'll have to use JSDoc type annotations to achieve this

While this is unfortunate, luckily JSDoc annotations are just as easy to use!
</Blocknote>

First install the DefinitelyTyped's type definition for ESLint, `@types/eslint` using your favorite package manager. And then, in your `eslintrc.js` file, write the following

```js
/** @type {import("@types/eslint").Linter.Config */
module.exports = {
  // ... your eslint config here
}
```

And there you go, your ESLint config is now typechecked by TypeScript which also means that you now get suggestions and completions through your editor! It's fun AND interactive!
