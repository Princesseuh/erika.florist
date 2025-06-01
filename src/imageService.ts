import type { LocalImageService } from "astro";
import sharpService from "astro/assets/services/sharp";
import { shorthash } from "astro/runtime/server/shorthash.js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import sharp from "sharp";
import * as Thumbhash from "thumbhash";

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

type ImageMetadataInternal = ImageMetadata & {
	fsPath: string;
};

export interface LocalImageServiceWithPlaceholder extends LocalImageService {
	generatePlaceholder: (
		src: ImageMetadata,
		width: number,
		height: number,
		quality?: number,
	) => Promise<string>;
	generateThumbhash: (src: ImageMetadata, width: number, height: number) => Promise<string>;
}

const service: LocalImageServiceWithPlaceholder = {
	...sharpService,
	async getHTMLAttributes(options, imageConfig) {
		const attributes = await sharpService.getHTMLAttributes!(options, imageConfig);

		// Use the original dimensions of the image for the width and height attributes. Maybe that Astro should do this by default? Not sure, and I can only blame myself.
		if (options.densities && typeof options.src === "object") {
			attributes.width = options.src.width;
			attributes.height = options.src.height;
		}

		return attributes;
	},
	generateThumbhash: async (src: ImageMetadata, width: number, height: number) => {
		const placeholderDimensions = getBitmapDimensions(width, height, 100);
		const originalFileBuffer = sharp((src as ImageMetadataInternal).fsPath).resize(
			placeholderDimensions.width,
			placeholderDimensions.height,
			{ fit: "inside" },
		);

		const { data, info } = await originalFileBuffer
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const binaryThumbHash = Thumbhash.rgbaToThumbHash(info.width, info.height, data);
		return Buffer.from(binaryThumbHash).toString("base64");
	},
	generatePlaceholder: async (src: ImageMetadata, width: number, height: number, quality = 100) => {
		const placeholderDimensions = getBitmapDimensions(width, height, quality);
		const hash = shorthash(src.src + width + height + quality);

		if (import.meta.env.PROD) {
			try {
				return readFileSync(CACHE_PATH + hash, "utf-8");
			} catch {
				/* empty */
			}
		}

		// HACK: It'd be nice to be able to get a Buffer out from an ESM import or `getImage`, wonder how we could do that..
		const originalFileBuffer = readFileSync((src as ImageMetadataInternal).fsPath);

		const placeholderBuffer = await sharp(originalFileBuffer)
			.resize(placeholderDimensions.width, placeholderDimensions.height, { fit: "inside" })
			.toFormat("webp", { quality: 1 })
			.modulate({
				brightness: 1,
				saturation: 1.2,
			})
			.blur()
			.toBuffer({ resolveWithObject: true });

		const result = `data:image/${placeholderBuffer.info.format};base64,${placeholderBuffer.data.toString(
			"base64",
		)}`;

		if (import.meta.env.PROD) {
			mkdirSync(CACHE_PATH, { recursive: true });
			writeFileSync(CACHE_PATH + hash, result);
		}

		return result;
	},
};

export default service;
