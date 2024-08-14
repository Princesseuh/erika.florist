import type { LocalImageService } from "astro";
import sharpService from "astro/assets/services/sharp";

const CACHE_PATH = "./node_modules/.astro/placeholders/";

function getBitmapDimensions(
	imgWidth: number,
	imgHeight: number,
	pixelTarget: number,
): { width: number; height: number } {
	// Aims for a bitmap of ~P pixels (w * h = ~P).
	// Gets the ratio of the width to the height. (r = w0 / h0 = w / h)
	const ratioWH = imgWidth / imgHeight;
	// Express the width in terms of height by multiply the ratio by the
	// height. (h * r = (w / h) * h)
	// Plug this representation of the width into the original equation.
	// (h * r * h = ~P).
	// Divide the bitmap size by the ratio to get the all expressions using
	// height on one side. (h * h = ~P / r)
	let bitmapHeight = pixelTarget / ratioWH;
	// Take the square root of the height instances to find the singular value
	// for the height. (h = sqrt(~P / r))
	bitmapHeight = Math.sqrt(bitmapHeight);
	// Divide the goal total pixel amount by the height to get the width.
	// (w = ~P / h).
	const bitmapWidth = pixelTarget / bitmapHeight;
	return { width: Math.round(bitmapWidth), height: Math.round(bitmapHeight) };
}

export interface LocalImageServiceWithPlaceholder extends LocalImageService {
	generatePlaceholder: (
		src: string,
		width: number,
		height: number,
		quality?: number,
	) => Promise<string>;
}

const service: LocalImageServiceWithPlaceholder = {
	...sharpService,
	async getHTMLAttributes(options, imageConfig) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const attributes = await sharpService.getHTMLAttributes!(options, imageConfig);

		// Use the original dimensions of the image for the width and height attributes. Maybe that Astro should do this by default? Not sure, and I can only blame myself.
		if (options.densities && typeof options.src === "object") {
			attributes.width = options.src.width;
			attributes.height = options.src.height;
		}

		return attributes;
	},
	generatePlaceholder: async (src: string, width: number, height: number, quality = 100) => {
		return "empty";
	},
};

export default service;
