import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
	content: ["./src/**/*.{astro,js,ts,tsx,md,mdoc}", "./api/**/*.rs"],
	darkMode: "class",
	corePlugins: {
		preflight: false,

		// We disable those because they add stuff to the CSS file even when unused
		filter: false,
		backdropFilter: false,
		ringWidth: false,
		ringColor: false,
		ringOffsetWidth: false,
		ringOffsetColor: false,
		boxShadow: false,
		transform: false,
		touchAction: false,
		scrollSnapType: false,
		borderColor: false, // If we don't disable this, Tailwind will apply a default border color to all the elements
		borderOpacity: false,
		textOpacity: false,

		// Things we might need in the future but disable for now as they also add stuff
		fontVariantNumeric: false,
	},
	theme: {
		screens: {
			sm: "640px",
			md: "768px",
			lg: "1024px",
			xl: "1280px",
		},
		extend: {
			colors: {
				// This should have been included in Tailwind...
				inherit: "inherit",

				// Theme
				isabelline: "#F5F5F5",
				bittersweet: "#FF5E5B",
				"dark-text": "#F1E7E4",
				"dark-subtle-text": "#dcdcdc",
				"rose-ebony": "#463539",
				"tropical-indigo": "#907AD6",
				puce: "#DB7F8E",
				"mobile-menu": "#191516",
				"mobile-menu-side": "#161313",
				"dark-skeleton": "#332e2f",

				"sugar-cane": "#FEFFFE", // Main text color
				"creative-work": "#5a5053", // Used for subtle texts
				"baltic-sea": "#28262C", // Main background color
				"darker-skylines": "#1d191a", // Footer background color
				"fin-lanka": "#212121", // Alternative background color, used for footnotes and blockquotes
				"engineer-black": "#1f1f1f", // Background color used for code blocks
				"beach-watermelon": "#DB1F3F", // Accent color, used mainly for links
				"pinky-unicorny": "#e65161", // Alt Accent Color, used when links are hovered
				"dark-beach-watermelon": "#e65161", // Accent color, used mainly for links
				"dark-pinky-unicorny": "#F291A0", // Alt Accent Color, used when links are hovered
			},
			width: {
				layout: "min(1280px, 100%)",
				header: "min(1040px, 100%)",
				footer: "min(980px, 100%)",
				index: "min(880px, 100%)",
				articleList: "min(920px, 100%)",
				article: "min(800px, 100%)",
				image: "min(1080px, 100%)",
				wiki: "min(1280px, 100%)",
			},
			gridTemplateColumns: {
				layout: "minmax(0, 0.75fr) minmax(0, 3.25fr);",
				content: "minmax(0, 4.25fr) minmax(0, 1.25fr);",
			},
			opacity: {
				15: "0.15",
			},
		},
	},

	plugins: [
		plugin(({ addComponents, theme }) => {
			addComponents({
				".wiki-navigation": {
					"& > li": {
						marginBottom: "1rem",
					},
				},
				".project-box": {
					padding: "1em",
					position: "relative",
					background: "transparent",
					color: theme("colors.white"),
					opacity: "0.90",
					transition: "all 0.1s ease-out",
					display: "flex",
					width: "431px",
					borderRadius: theme("borderRadius.sm"),
					"@apply bg-rose-ebony bg-opacity-5 dark:bg-isabelline dark:bg-opacity-5": {},
					"&.project-featured": {
						opacity: "1",
					},
					"&:hover": {
						// NOTE: When applied through the CSS-in-JS syntax, opacity information doesn't stay on colors, this workaround it
						"@apply hover:bg-opacity-20 hover:bg-pinky-unicorny hover:dark:bg-pinky-unicorny dark:hover:bg-opacity-30":
							{},
						opacity: "1",
						color: theme("colors.white"),
						textDecoration: "none",
						transition: "all 0.1s ease-out",
					},
				},
				"a:focus > .cover-title": {
					opacity: "100",
				},
				// TODO: Figure out a way to simplify this perhaps? This is by far the most complex element on the website
				".cover-title": {
					position: "absolute",
					color: theme("colors.sugar-cane"),
					bottom: "0",
					margin: "0",
					width: "100%",
					textAlign: "center",
					fontSize: theme("fontSize.3xl"),
					lineHeight: "170px",
					"@apply bg-pinky-unicorny bg-opacity-80 transition-opacity": {},
					opacity: "0",
					borderRadius: theme("borderRadius.sm"),
					"&:hover": {
						opacity: "100",
					},
				},
				".social-icon": {
					color: "inherit",
					marginRight: "1.2em",
					display: "flex",
					alignItems: "center",
					"@apply dark:text-inherit": {},
				},
				".social-mastodon": {
					"&:hover": {
						color: "#6364FF",
					},
				},
				".social-twitter": {
					"&:hover": {
						color: "#1DA1F2",
					},
				},
				".social-other": {
					"&:hover": {
						color: "#d8d9d8",
					},
				},

				// Table of content
				".toc": {
					transition: "opacity .1s linear",
					position: "sticky",
					top: "2rem",
					"& ol": {
						listStyleType: "none",
						margin: "0",
						padding: "0",
					},
					"& .toc-depth-3": {
						paddingLeft: "0.75rem",
						borderLeft: "1px solid rgba(146,149,152,.15)",
					},
					"& a": {
						color: theme("colors.creative-work"),
						"@apply dark:text-dark-subtle-text": {},
					},
				},

				// Footnotes counter
				'[role="doc-noteref"]::after': {
					counterIncrement: "footnotes",
					content: '"["  counter(footnotes)  "]"',
					fontSize: ".8rem",
					position: "relative",
					top: "-6px",
					left: "1px",
					userSelect: "none",
				},

				// Note blocks, often used on wiki
				".block-note": {
					padding: "1em",
					margin: "1.5em auto",
					maxWidth: "min(675px, 100%)",
					backgroundColor: theme("colors.fin-lanka"),
					color: theme("colors.isabelline"),
					borderRadius: theme("borderRadius.sm"),

					".block-title": {
						display: "block",
						fontWeight: "bold",
						textAlign: "center",
						padding: ".5rem 0",
						paddingTop: "0",
					},

					"& p:last-of-type": {
						marginBottom: "0",
					},

					a: {
						color: theme("colors.dark-beach-watermelon"),
						"&:hover": {
							color: theme("colors.dark-pinky-unicorny"),
						},
					},
				},

				// Footnotes
				".footnotes": {
					backgroundColor: theme("colors.fin-lanka"),
					borderRadius: "4px",
					padding: ".5rem",
					marginTop: "1rem",
				},

				".footnotes__title": {
					marginTop: "0",
					marginBottom: "1rem",
					paddingLeft: ".5rem",
				},

				".footnotes__list": {
					paddingLeft: "0",
					listStylePosition: "inside",
					padding: "0 .75rem",
				},

				".foonotes__list-item": {
					marginBottom: ".5rem",
				},

				// Image rendering
				".pixelated": {
					imageRendering: "pixelated",
				},
			});
		}),
		plugin(({ addBase, theme }) => {
			addBase({
				// Small reset, preflight include a lot of stuff we don't use so let's make our own
				"*, ::before, ::after": {
					boxSizing: "border-box",
				},

				html: {
					fontSize: "17px",
					lineHeight: "1.5",
				},

				"body, dl, dd, p": {
					margin: "0",
				},

				":root": {
					"-moz-tab-size": "4",
					tabSize: "4",
				},

				"input:disabled+label": {
					color: theme("colors.creative-work"),
				},

				// Custom stuff
				"html, body": {
					fontFamily:
						"Anuphan, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', fallback-arial, 'Arial', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
					backgroundColor: theme("colors.darker-skylines"),
					color: theme("colors.rose-ebony"),
					counterReset: "footnotes",
					"@apply dark:text-dark-text": {},
				},

				".dark": {
					"@apply bg-mobile-menu": {},
				},

				a: {
					textDecoration: "none",
					fontWeight: "500",
					color: theme("colors.beach-watermelon"),
					transition: "color .1s",
					"@apply dark:text-dark-beach-watermelon": {},
					"&:hover": {
						textDecoration: "underline",
						textUnderlinePosition: "from-font",
						textDecorationThickness: "2px",
						color: theme("colors.pinky-unicorny"),
						"@apply dark:text-dark-pinky-unicorny": {},
					},
				},

				"footer a": {
					color: theme("colors.dark-beach-watermelon"),
					"&:hover": {
						color: theme("colors.dark-pinky-unicorny"),
					},
				},

				"h1, h2, h3, h4": {
					letterSpacing: "-.01em",
					fontWeight: "550",
				},

				dt: { fontWeight: "bold" },
				"dd:not(:last-of-type)": {
					marginBottom: "1rem",
				},

				// Articles
				article: {
					marginBottom: "3rem",
					transition: "opacity .1s linear",
				},

				code: {
					fontFamily: theme("fontFamily.mono"),
					backgroundColor: "#212121",
					borderRadius: "4px",
					fontSize: "0.875rem",
					lineHeight: "1.25rem",
					color: "#f5f5f5",
					padding: "0.08em 0.3em",
					wordBreak: "break-word",
				},

				"article p, .post p, .post ul, .post pre, .post blockquote, .post .expressive-code": {
					marginBottom: "1em",
				},

				".post > h1, .post > h2": {
					marginTop: "1.3rem",
					marginBottom: ".6rem",
				},

				".post > h3": {
					marginBottom: ".6rem",
				},

				".post li>p": {
					marginBottom: ".6rem",
				},

				".post blockquote": {
					paddingTop: "0.5rem",
					paddingBottom: "0.5rem",
					paddingLeft: "1rem",
					borderLeft: "5px solid",
					borderColor: theme("colors.pinky-unicorny"),
					backgroundColor: "#e6516124",
					borderRadius: theme("borderRadius.sm"),
					fontStyle: "italic",
					fontWeight: "450",
					marginLeft: "0",
					marginRight: "0",
					"@apply sm:mx-5": {},
					"& p:last-child": {
						marginBottom: "0",
					},
				},

				".post blockquote [data-favicon]": {
					marginLeft: "0.25em",
				},

				".post figure": {
					marginTop: "1.4rem",
					marginBottom: "1rem",
					textAlign: "center",
					"@apply sm:mx-8 mx-0": {},
				},

				".post img:not([data-favicon])": {
					maxWidth: "100%",
					height: "auto",
					borderRadius: theme("borderRadius.sm"),
				},

				".post .image-right": {
					float: "right",
					marginLeft: "1.5rem",
					marginRight: ".5rem",
					marginTop: ".8rem",
					maxWidth: "min-content",
				},

				".post .image-left": {
					"@apply sm:float-left sm:mr-6 sm:ml-2 sm:mt-3 sm:max-w-max": {},
				},

				".post figcaption": {
					textAlign: "center",
					display: "block",
					margin: ".15rem 0",
					fontStyle: "italic",
					color: theme("colors.creative-work"),
					fontSize: ".95rem",
					"@apply dark:text-dark-subtle-text": {},
				},

				".post > iframe": {
					margin: "0 auto 1rem",
					display: "block",
				},

				".header-anchor": {
					color: "inherit",
					paddingLeft: "1.5ch",
					marginLeft: "-1.5ch",

					"&:hover": {
						color: "inherit",

						"&:after": {
							content: "'#'",
							color: theme("colors.beach-watermelon"),
							position: "relative",
							left: "-1.5ch",
							float: "left",
							width: "0",
							height: "0",
							textDecoration: "none",
							display: "inline-block",
						},
					},
				},
			});
		}),
	],
} satisfies Config;
