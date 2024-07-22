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
				"centered-width": "min(100%, 76ch)",
			},
			colors: {
				// Theme
				"accent-valencia": "#C73C2E",
				"white-sugar-cane": "#f3f4ed",
				"black-charcoal": "#0A0908",
				"orange-carrot": "#F9A03F",
				"green-reseda": "#667761",
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
		},
	},

	plugins: [
		plugin(({ addComponents }) => {
			addComponents({
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

				// Custom stuff
				"html, body": {
					fontFamily:
						"'IBM Plex', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', fallback-arial, 'Arial', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
				},

				"h1, h2, h3, h4, h5, h6": {
					fontFamily:
						"'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', fallback-arial, 'Arial', 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
				},

				a: {
					textDecoration: "none",
				},

				"a:hover": {
					color: theme("colors.accent-valencia"),
				},

				p: {
					marginBottom: "1em",
				},
			});
		}),
	],
} satisfies Config;
