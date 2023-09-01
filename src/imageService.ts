import { getBaseSiteURL } from "$utils";
import type { LocalImageService } from "astro";
import sharpService from "astro/assets/services/sharp";
import { readFileSync } from "fs";
import sharp from "sharp";

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
	generatePlaceholder: async (src: string, width: number, height: number, quality = 100) => {
		const placeholderDimensions = getBitmapDimensions(width, height, quality);

		// HACK: It'd be nice to be able to get a Buffer out from an ESM import or `getImage`, wonder how we could do that..
		const originalFileBuffer = import.meta.env.PROD
			? readFileSync("./dist/" + src)
			: await fetch(new URL(src, getBaseSiteURL()))
					.then((response) => response.arrayBuffer())
					.then((buffer) => Buffer.from(buffer));

		const placeholderBuffer = await sharp(originalFileBuffer)
			.resize(placeholderDimensions.width, placeholderDimensions.height, { fit: "inside" })
			.toFormat("webp", { quality: 1 })
			.modulate({
				brightness: 1,
				saturation: 1.2,
			})
			.blur()
			.toBuffer({ resolveWithObject: true });

		return `data:image/${placeholderBuffer.info.format};base64,${placeholderBuffer.data.toString(
			"base64",
		)}`;
	},
};

export default service;
