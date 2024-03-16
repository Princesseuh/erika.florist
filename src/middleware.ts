import { getBaseSiteURL } from "$utils";
import { decode } from "tiny-decode";
import { ELEMENT_NODE, TEXT_NODE, transform, walk, type TextNode } from "ultrahtml";
import sanitize from "ultrahtml/transformers/sanitize";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (ctx, next) => {
	const response = await next();

	if (ctx.url.pathname.startsWith("/rss")) {
		const html = await response.text();

		const output = await transform(html, [
			async (node) => {
				await walk(node, (node) => {
					// Simplify picture elements to img elements, some feeds are struggling with it
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

					// Make sure links are absolute, some readers are not smart enough to figure it out
					if (
						node.type === ELEMENT_NODE &&
						node.name === "a" &&
						node.attributes.src?.startsWith("/")
					) {
						node.attributes.src = getBaseSiteURL().slice(0, -1) + node.attributes.src;
					}

					// Remove favicon images, some readers don't know they should be inline and it ends up being a broken image
					if (
						node.type === ELEMENT_NODE &&
						("data-favicon" in node.attributes || "data-favicon-span" in node.attributes)
					) {
						node = node as unknown as TextNode;
						node.type = TEXT_NODE;
						node.value = "";
					}

					// Remove EC buttons
					if (node.type === ELEMENT_NODE && node.attributes["data-code"]) {
						node = node as unknown as TextNode;
						node.type = TEXT_NODE;
						node.value = "";
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
