---
  title: "My VS Code setup"
  tagline: "Because feeling at home is important"
  loadCSSModules: ["code"]
  navigation:
    label: 'VS Code setup'
    category: computers
---

These days, my editor of choice is, like many people, [VS Code](https://code.visualstudio.com/)

Previously it was [Sublime Text](https://www.sublimetext.com/) but a Python-based editor in a world where the most used language is Javascript and everyone and theirs mothers does web stuff - it doesn't work anymore. I'm glad you paved the way for the future Sublime. I'll always love you for all you did.

Ok! Now that the goodbyes are done, let's talk about my VS Code setup

<Image src="screenshot.png" alt="Screenshot of my VS Code setup, the color scheme is dark, the sidebar is on the right" caption="My setup is pretty classic so don't expect anything too crazy. Some newly added settings might be missing from this particular screenshot" />

## Settings

Those are intentionally not complete, some of the settings I have in my full config files are for things I don't really use (such as Zen Mode or the Git support inside the editor), default settings that I redefine just to be exhaustive or things that are personal choices outside of the scope of this article (such as if I accept telemetry or not)

```json
{
  // Visuals
  "workbench.colorTheme": "lucy-evening",
  "editor.fontFamily": "'Iosevka', 'Fira Code', 'Font Awesome 5 Free Regular', 'Font Awesome 5 Free Solid', 'Font Awesome 5 Brands Regular'",
  "editor.fontSize": 15,
  "editor.fontWeight": "500",
  "editor.fontLigatures": true,
  "editor.minimap.enabled": false,
  "workbench.sideBar.location": "right",
  "window.menuBarVisibility": "toggle",
  "editor.wordWrap": "on",
  "editor.rulers": [80, 120],
  "workbench.colorCustomizations": {
    "terminal.background": "#17161b",
    "panel.background": "#131317",
    "statusBar.background": "#17161b",
    "tab.activeBackground": "#25242b",
    "sideBarSectionHeader.background": "#131317",
    "activityBar.foreground": "#b8aba5",
    "sideBar.foreground": "#a39793"
  },

  // Usability
  "files.autoSave": "afterDelay",
  "files.trimTrailingWhitespace": true,
  "files.trimFinalNewlines": true,
  "files.insertFinalNewline": true,
  "editor.formatOnSave": false,
  "editor.formatOnPaste": true,
  "editor.linkedEditing": true,
  "files.exclude": {
    "**/node_modules/**": true
  },
  "workbench.startupEditor": "newUntitledFile",
  "workbench.editor.highlightModifiedTabs": true,
  "editor.suggest.preview": true,
  "editor.bracketPairColorization.enabled": true,

  // Language specifics
  "html.format.indentInnerHtml": true,
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.quickSuggestions": false,
    "files.trimTrailingWhitespace": false,
    "editor.rulers": [] // Disable rulers in Markdown
  }
}
```

### Visuals

My favorite font for coding these days is by far [Iosevka](https://typeof.net/Iosevka/). I find the default font weight a bit hard to read on my screen so I put it at 500. I use [Fira Code](https://github.com/tonsky/FiraCode) (my previous font) as a fallback for computers where Iosevka is not installed. For both, ligatures are enabled - love those

I disable the minimap. I don't find it to be useful in any way as I probably don't work on files big enough anyway. I put the sidebar on the right side, that way toggling it doesn't change the position of the code. Probably one of the best changes I've made over the year to my config funnily enough, it's really good. I also hide the menu bar because it clash a lot with the rest of the color scheme

## Extensions

I try to avoid using extensions as much as possible to avoid unnecessary bloating and performance issues however there's so many good stuff available on VS Code that it's really hard not to overcommit on extensions and sometimes well, a few ms more to start your editor you're gonna sit in all day doesn't hurt too much 😅

### **Auto Close Tag** and **Auto Rename Tag** by Jun Han

So both of those features are actually available by default in VS Code (`html.autoClosingTags` for Auto Close Tag and `editor.linkedEditing` for Auto Rename Tag) and it works really well!

Unfortunately for both of those the support is limited and so they only work in a limited list of format. Those extensions work in every format so that's good

### Highlight Matching Tag

TODO: screenshot of the extension

This extension highlights matching opening and closing tags. It makes it much easier to see where you are in a file, simple enough.

I pair it with VS Code's native bracket pair colorization (`editor.bracketPairColorization.enabled`). It's not necessarily pretty, the colors get pretty funky at times but it's very useful. One day, I'll customize the colors so it look nicer

### Linters and EditorConfig

I use the following linters with mostly their default settings: ESLint, stylelint and markdownlint. Most of the projects I work on are in Javascript (ESLint), have CSS (stylelint) and use Markdown for content (markdownlint) so, it just makes sense. They all three have very good integrations into VS Code, it's really pleasant to work with

Additionally, I use EditorConfig for VS Code to add support for .editorconfig files. I really wonder why VS Code doesn't have support for these natively yet as they are used in a lot of big profile projects, including VS Code itself but oh well

### Todo Tree

This one I use a lot! It highlights and list every TODOs (and other tags) in your project. It's really satisfying to see the list of TODOs get smaller and smaller!

It's heavily configurable, notably you can add as many custom tags as you want. Personally, in addition to the default ones, I added a tag "NOTE" to list every parts that need explanation.

Often, parts that need explanations are parts that should be simplified so much like TODOs I try to reduce the list of NOTEs as much as possible ha!
