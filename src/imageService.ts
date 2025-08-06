import type { LocalImageService } from "astro";
import sharpService from "astro/assets/services/sharp";
import { shorthash } from "astro/runtime/server/shorthash.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const CACHE_PATH = "./node_modules/.astro/placeholders/";

// Adapted from https://github.com/ampproject/amp-toolbox/blob/d9a213b7a8245f176c9508fdf7dcd1255670aa4e/packages/optimizer/lib/transformers/AddBlurryImagePlaceholders.js#L268
/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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

export type ImageMetadataInternal = ImageMetadata & {
	fsPath: string;
};

export interface LocalImageServiceWithPlaceholder extends LocalImageService {
	generatePlaceholder: (
		src: ImageMetadata,
		width: number,
		height: number,
		quality?: number,
	) => Promise<string>;
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
