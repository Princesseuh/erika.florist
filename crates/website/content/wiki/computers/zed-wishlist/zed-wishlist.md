---
  title: "Zed Wishlist"
  navigation:
    label: 'Zed Wishlist'
    category: computers
---

I've recently been using the [Zed code editor](https://zed.dev/) and really enjoying the experience. Nonetheless, as a fairly new project, it's missing a few features that I've come to rely on in other editors or has some rough edges. Here's a list of things I'd like to see added or improved in Zed.

Entries that are checked off are features that have been added since I wrote this post.

## Features

- [x] ~~Support for custom themes~~
  - [ ] Ability to customize the color of the bottom panel individually from the other backgrounds
  - [ ] Better documentation would be great, it requires a lot of trial and error to figure out what variables do what
- [x] ~~Support for custom languages~~
- [x] ~~[Diff view](https://github.com/zed-industries/zed/issues/4523)~~
- [x] ~~[Source Control Panel](https://github.com/zed-industries/zed/issues/4367)~~
- [x] ~~[Rainbow brackets](https://github.com/zed-industries/zed/issues/5259)~~
- [x] ~~[Indentation guides](https://github.com/zed-industries/zed/issues/5373)~~
  - [x] ~~Indentation guides in the explorer panel, too (especially, actually)~~
- [x] ~~[EditorConfig support](https://github.com/zed-industries/zed/issues/8534)~~
- [x] ~~Image viewer~~
- [ ] [Semantic highlighting (e.g. different colors for variables, functions, types, etc)](https://github.com/zed-industries/zed/issues/7450)
- [ ] Ability to add padding to the terminal

## Annoyances

- [x] ~~Client-side filtering for LSP completions, Zed doesn't seem to be quite as smart about filtering completions as VS Code is, and might be relying on the server's filtering only.~~
- [x] ~~Quote auto-closing is sometimes annoying, notably, it tries to auto-close quotes in text contexts, for instance typing "Can't" will result in "Can''t".~~
- [x] ~~CTRL+Click to go to definition doesn't work like in VS Code, in VS Code that shortcut does Go to Definition, Find All References, etc all at once, but it seems like Zed isn't quite as smart about it.~~
- [ ] Quick fixes (code actions) are hard to use, you can't use them from diagnostics like you can in VS Code, and so sometimes you need to open the quick fix list at a specific location to get the right fix.
