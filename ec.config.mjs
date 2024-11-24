import { defineEcConfig } from "astro-expressive-code";

export default defineEcConfig({
	plugins: [
		{
			name: "custom-style",
			baseStyles: `
          .frame.is-terminal:not(.has-title) .header {display: none;}
          .frame .header {border-bottom: 2px solid #313131;}
          .frame.is-terminal .header::before {display: none;}
          .frame.is-terminal:not(.has-title) {
            --button-spacing: 0.4rem;
          }
          .frame.is-terminal:not(.has-title) code, .frame.is-terminal:not(.has-title) pre {
            border-radius: 4px
          }
          .frame.is-terminal .header {
            justify-content: initial;
            font-weight: initial;
            padding-left: 1rem;
            color: #fff;
          }
          @media (min-width: 768px) {
            .expressive-code {
              margin-left: -1rem;
              margin-right: -1rem;
            }
          }
          `,
			hooks: {},
		},
	],
	themes: ["github-dark-default"],
	useThemedScrollbars: false,
	useThemedSelectionColors: false,
	styleOverrides: {
		frames: {
			frameBoxShadowCssValue: "none",
			tooltipSuccessBackground: "#e65161",
		},
		uiLineHeight: "inherit",
		codeFontSize: "0.875rem",
		codeLineHeight: "1.25rem",
		borderRadius: "4px",
		borderWidth: "0px",
		codePaddingInline: "1rem",
		codeFontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
	},
});
