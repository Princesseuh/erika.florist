import { getBaseSiteURL } from "$utils";
import { decode } from "tiny-decode";
import { ELEMENT_NODE, transform, walk } from "ultrahtml";
import sanitize from "ultrahtml/transformers/sanitize";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (ctx, next) => {
	const response = await next();

	if (ctx.url.pathname.startsWith("/rss")) {
		const html = await response.text();

		const output = await transform(html, [
			async (node) => {
				await walk(node, (node) => {
					if (node.type === ELEMENT_NODE && node.name === "picture") {
						if (node.parent.type === ELEMENT_NODE && node.parent.name === "a") {
							const imgChildren = node.children.find(
								(child) => child.type === ELEMENT_NODE && child.name === "img",
							);

							node.name = "img";
							node.attributes = imgChildren?.attributes;
							node.attributes.src = getBaseSiteURL().slice(0, -1) + node.attributes.src;
							// biome-ignore lint/performance/noDelete: <explanation>
							delete node.attributes.srcset;
							// biome-ignore lint/performance/noDelete: <explanation>
							delete node.attributes.sizes;
							// biome-ignore lint/performance/noDelete: <explanation>
							delete node.attributes.onload;
							// biome-ignore lint/performance/noDelete: <explanation>
							delete node.attributes.style;
						}
					}
				});

				return node;
			},
			sanitize({
				dropAttributes: {
					class: ["*"],
					"data-astro-source": ["*"],
					"data-astro-source-loc": ["*"],
					"data-astro-source-file": ["*"],
					"data-favicon": ["*"],
					"data-image-component": ["img"],
				},
			}),
		]);

		const headers = new Headers(response.headers);
		headers.delete("Content-Type");
		headers.set("Content-Type", "application/rss+xml");

		return new Response(decode(output), {
			status: 200,
			headers: headers,
		});
	}

	return response;
});
