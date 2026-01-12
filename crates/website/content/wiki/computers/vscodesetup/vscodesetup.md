---
  title: "My VS Code setup"
  tagline: "Because feeling at home is important"
  navigation:
    label: 'VS Code setup'
    category: computers
---

These days, my editor of choice is, like many people, [VS Code](https://code.visualstudio.com/)

Previously it was [Sublime Text](https://www.sublimetext.com/) but a Python-based editor in a world where the most used language is Javascript and everyone and theirs mothers does web stuff - it doesn't work anymore. I'm glad you paved the way for the future Sublime. I'll always love you for all you did.

Ok! Now that the goodbyes are done, let's talk about my VS Code setup

{{ image src="./screenshot.png" alt="Screenshot of my VS Code setup, the color scheme is dark, the sidebar is on the right" /}}

## Settings

Those are intentionally not complete, some of the settings I have in my full config files are for things I don't really use (such as Zen Mode or the Git support inside the editor), default settings that I redefine just to be exhaustive or things that are personal choices outside of the scope of this article (such as if I accept telemetry or not)

```json title="settings.json"
{
	// Visuals
	"editor.fontFamily": "'Iosevka', 'Fira Code', 'Font Awesome 5 Free Regular', 'Font Awesome 5 Free Solid', 'Font Awesome 5 Brands Regular'",
	"editor.fontSize": 15,
	"editor.fontWeight": "500",
	"editor.fontLigatures": true,
	"editor.minimap.enabled": false,
	"workbench.sideBar.location": "right",
	"editor.wordWrap": "on",
	"editor.rulers": [80, 120],
	"editor.inlayHints.fontSize": 14,
	"workbench.colorCustomizations": {
		"terminal.background": "#17161b",
		"panel.background": "#131317",
		"statusBar.background": "#17161b",
		"tab.activeBackground": "#25242b",
		"sideBarSectionHeader.background": "#131317",
		"activityBar.foreground": "#b8aba5",
		"sideBar.foreground": "#a39793",

		// Inlay hints
		"editorInlayHint.background": "#00000000",
		"editorInlayHint.foreground": "#ffffff65"
	},
	"editor.tabSize": 2,
	"workbench.tree.indent": 10,

	// Usability
	"files.autoSave": "afterDelay",
	"files.autoSaveDelay": 5000,
	"files.trimTrailingWhitespace": true,
	"files.trimFinalNewlines": true,
	"files.insertFinalNewline": true,
	"editor.insertSpaces": false,
	"editor.detectIndentation": false,
	"editor.formatOnPaste": true,
	"editor.formatOnSave": true,
	"editor.formatOnType": true,
	"editor.linkedEditing": true,
	"editor.codeActionsOnSave": {
		"source.organizeImports": true
	},
	"editor.accessibilitySupport": "off",
	"search.exclude": {
		"**/bower_components": true,
		"**/*.code-search": true,
		"**/dist/**": true,
		"**/package-lock.json": true,
		"**/pnpm-lock.yaml": true,
		"**/yarn.lock": true
	},
	"workbench.startupEditor": "newUntitledFile",
	"workbench.editor.highlightModifiedTabs": true,
	"explorer.confirmDelete": false,
	"editor.suggest.preview": true,
	"editor.quickSuggestions": {
		"strings": true
	},
	"terminal.integrated.shellIntegration.enabled": true,

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

A few random points:

- I disable the minimap. I don't find it to be useful in any way as I probably don't work on files big enough anyway.
- I put the sidebar on the right side, that way toggling it doesn't change the position of the code.
- I have rulers at 80 and 120 characters, an habit I took from my Python days. I find that it subconsciously helps me keep my lines shorter.

### Usability

I have all the "do things on save" settings enabled, I don't want to care about formatting or organizing imports, I just want it to happen.

## Extensions

I'll skip over a few classic here, such as Prettier and ESLint for formatting & linting JavaScript, general language-support extensions (ex: Astro, Rust.. etc), to focus on the ones that are a bit more general.

### Todo Tree

Highlights and list every TODOs (and other tags) in your project. It's really satisfying to see the list of TODOs get smaller and smaller!

It's heavily configurable, notably you can add as many custom tags as you want. Personally, in addition to the default ones, I added a tag "NOTE" to list every parts that need explanation.

### Insert Date String

Inserts the current date and time in the format of your choice. I use it to add the date to my comments, as I typically end my comments with `- erika, 2023-11-12`
