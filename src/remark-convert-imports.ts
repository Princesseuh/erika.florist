import { visit } from "unist-util-visit";

export function remarkConvertImports() {
	return function (tree: any) {
		visit(tree, "mdxJsxFlowElement", (node) => {
			if (node.name !== "Image") return;

			const srcAttribute = node.attributes.findIndex((attr: any) => attr.name === "src");
			if (srcAttribute === -1 || typeof node.attributes[srcAttribute].value === "object") return;

			console.log("do we get here2?");

			const stringValue = node.attributes[srcAttribute].value;
			node.attributes[srcAttribute].value = {
				type: "mdxJsxAttributeValueExpression",
				value: `import("${stringValue}")`,
				data: {
					estree: {
						type: "Program",
						body: [
							{
								type: "ExpressionStatement",
								expression: {
									type: "ImportExpression",
									source: {
										type: "Literal",
										value: stringValue,
										raw: `"${stringValue}"`,
									},
								},
							},
						],
					},
				},
			};
		});
	};
}
