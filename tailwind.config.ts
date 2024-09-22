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
		// borderColor: false, // If we don't disable this, Tailwind will apply a default border color to all the elements
		borderOpacity: false,
		textOpacity: false,

		// Things we might need in the future but disable for now as they also add stuff
		fontVariantNumeric: false,
	},
	theme: {
		extend: {
			screens: {
				"3xl": "1792px",
			},
			fontSize: {
				"4.5xl": "2.75rem",
			},
			width: {
				"full-width": "min(100%, 1536px)",
				"centered-width": "min(100%, 72ch)",
			},
			colors: {
				// Theme
				"accent-valencia": "#C73C2E",
				"white-sugar-cane": "#F7F7F7",
				"black-charcoal": "#0A0908",
				"subtle-charcoal": "#4d4d4d",
				"orange-carrot": "#F9A03F",
				"violet-ultra": "#52489C",
			},
			lineHeight: {
				"somewhat-tight": "1.05",
				"extra-tight": "0.925",
			},
			letterSpacing: {
				"somewhat-tight": "-0.01em",
			},
			columns: {
				masonry: "auto 400px",
				"max-masonry": "4 350px",
			},
			gridTemplateColumns: {
				layout: "minmax(0, 0.25fr) minmax(0, 0.50fr);",
				"layout-tablet": "minmax(0, 1fr);",
				"layout-tablet-sidenote": "minmax(0, 0.75fr);",
			},
		},
	},

	plugins: [
		plugin(({ addComponents }) => {
			addComponents({
				// Image rendering
				".pixelated": {
					imageRendering: "pixelated",
				},

				// Social icons
				".social-icon": {
					color: "inherit",
					marginRight: "1.2em",
					display: "flex",
					alignItems: "center",
					"@apply dark:text-inherit": {},
				},
				".social-mastodon": {
					"&:hover, &:focus": {
						color: "#6364FF",
					},
				},
				".social-github, .social-other": {
					"&:hover, &:focus": {
						color: "#d8d9d8",
					},
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

				// Custom stuff
				"html, body": {
					fontFamily:
						"'IBM Plex', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', fallback-arial, 'Arial', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
					color: theme("colors.black-charcoal"),
				},

				"h1, h2, h3, h4, h5, h6": {
					fontFamily:
						"'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', fallback-arial, 'Arial', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
				},

				a: {
					textDecoration: "none",
				},

				p: {
					marginBottom: "1em",
				},

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
						fontWeight: "500",
						color: theme("colors.subtle-charcoal"),
					},
					"& a:hover, & a:focus": {
						color: theme("colors.black-charcoal"),
						textDecoration: "underline",
					},
				},

				".prose": {
					a: {
						color: theme("colors.accent-valencia"),
						fontWeight: "500",
					},

					"a:hover, a:focus": {
						color: theme("colors.white-sugar-cane"),
						backgroundColor: theme("colors.accent-valencia"),
					},

					".expressive-code": {
						marginBottom: "1rem",
					},

					"& > h1, & > h2": {
						marginTop: "1.3rem",
						marginBottom: ".6rem",
					},

					"& > h3": {
						marginBottom: ".6rem",
					},

					"& > h1, & > h2, & > h3, & > h3, & > h4, & > h5": {
						"@apply hyphens-auto sm:hyphens-none": {},
					},

					"img:not([data-favicon])": {
						maxWidth: "100%",
						height: "auto",
						borderRadius: theme("borderRadius.sm"),
					},

					figure: {
						marginTop: "1.4rem",
						marginBottom: "1rem",
						textAlign: "center",
						"@apply xl:-mx-4 mx-0": {},
					},

					figcaption: {
						textAlign: "center",
						display: "block",
						margin: ".15rem 0",
						fontStyle: "italic",
						fontSize: ".95rem",
						"@apply text-subtle-charcoal": {},
					},

					"li>p": {
						marginBottom: ".6rem",
					},

					li: {
						paddingBottom: "0.25em",
					},

					"ul, ol": {
						margin: "0",
						marginBottom: "1em",
						padding: "0",
						paddingLeft: "1.5em",
					},

					"li>ul, li>ol": {
						padding: "0",
						paddingLeft: "1.5em",
					},
				},
			});
		}),
		plugin(({ addUtilities }) => {
			addUtilities({
				".all-unset": {
					all: "unset",
				},
			});
		}),
	],
} satisfies Config;
