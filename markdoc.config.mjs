import { component, defineMarkdocConfig, nodes } from "@astrojs/markdoc/config";

export default defineMarkdocConfig({
	nodes: {
		fence: {
			attributes: { ...nodes.fence.attributes, title: { type: String, render: "title" } },
			render: component("./src/components/content/Code.astro"),
		},
		blockquote: {
			attributes: { ...nodes.blockquote.attributes, title: { type: String, render: "title" } },
			render: component("./src/components/content/Blocknote.astro"),
		},
		link: {
			attributes: nodes.link.attributes,
			render: component("./src/components/ExternalLink.astro"),
		},
		list: {
			attributes: nodes.list.attributes,
			render: component("./src/components/content/List.astro"),
		},
	},
	tags: {
		blockquote: {
			attributes: {
				title: { type: String, render: "title" },
				block: { type: Boolean, default: true },
			},
			render: component("./src/components/content/Blocknote.astro"),
		},
		image: {
			attributes: {
				...nodes.image.attributes,
				src: { type: String },
				figureProps: { type: Object },
			},
			children: ["text"],
			render: component("./src/components/content/Image.astro"),
		},
		dinkus: {
			render: component("./src/components/content/Dinkus.astro"),
		},
		sidenote: {
			attributes: {
				direction: { type: String, default: "right" },
			},
			render: component("./src/components/content/Sidenote.astro"),
		},
	},
});
