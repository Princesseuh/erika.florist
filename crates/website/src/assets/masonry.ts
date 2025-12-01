// Adapted from https://github.com/Spope/MiniMasonry.js
// LICENSE: https://github.com/Spope/MiniMasonry.js/blob/master/LICENSE

// May a native CSS masonry save us one day

interface MasonryConfig {
	/** Target width of elements. */
	baseWidth?: () => number;
	/** Horizontal gutter between elements. */
	gutterX?: number;
	/** Vertical gutter between elements. */
	gutterY?: number;
	/** Gutter between elements, if gutterX and gutterY are not set. */
	gutter?: number;
	/** Container element. */
	container: HTMLElement;
	/** Gutter between elements when there's only one column. */
	ultimateGutter?: number;
}

export class MiniMasonry {
	#sizes: number[] = [];
	#columns: number[] = [];
	#container: HTMLElement;
	#count = 0;
	#width = 0;
	#currentGutterX: number;
	#currentGutterY: number;
	#resizeTimeout: number | null = null;
	#firstRun = true;
	#conf: Required<MasonryConfig>;

	constructor(conf: MasonryConfig) {
		this.#conf = {
			baseWidth: () => 255,
			gutterX: conf.gutterX ?? conf.gutter ?? 10,
			gutterY: conf.gutterY ?? conf.gutter ?? 10,
			gutter: 10,
			ultimateGutter: 5,
			...conf,
		};

		this.#currentGutterX = this.#conf.gutterX;
		this.#currentGutterY = this.#conf.gutterY;
		this.#container = this.#conf.container;

		window.addEventListener("resize", this.resizeThrottler.bind(this));

		this.layout();
	}

	private getCount() {
		const totalWidth = this.#width + this.#currentGutterX;
		return Math.floor(totalWidth / (this.#conf.baseWidth() + this.#currentGutterX));
	}

	public layout() {
		this.#width = Math.max(this.#container.clientWidth, this.#conf.baseWidth());

		// On first run, the right margin isn't taken into account correctly for some reason, so we need to reduce the width by 16px
		if (this.#firstRun && this.#width > this.#conf.baseWidth()) {
			this.#width -= 16;
			this.#firstRun = false;
		}

		this.#currentGutterX = this.getCount() === 1 ? this.#conf.ultimateGutter : this.#conf.gutterX;
		if (this.#width < this.#conf.baseWidth() + 2 * this.#currentGutterX) this.#currentGutterX = 0;
		this.#count = this.getCount();

		const totalWidth = this.#width + this.#currentGutterX;
		const colWidth = Number.parseFloat(
			(totalWidth / this.#count - this.#currentGutterX).toFixed(2),
		);

		this.#columns = Array<number>(this.#count).fill(0);
		const children = this.#container.children as HTMLCollectionOf<HTMLElement>;
		const childArray = Array.from(children);
		for (const child of childArray) {
			child.style.width = `${colWidth}px`;
		}
		this.#sizes = childArray.map((child) => child.clientHeight);

		let index = 0;
		for (const child of children) {
			const nextColumn = index % this.#columns.length;
			const childrenGutter = nextColumn !== this.#columns.length ? this.#currentGutterX : 0;
			const x = (colWidth + childrenGutter) * nextColumn;
			const y = this.#columns[nextColumn] ?? 0;

			child.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
			this.#columns[nextColumn] =
				(this.#columns[nextColumn] ?? 0) + (this.#sizes[index] ?? 0) + this.#currentGutterY;
			index++;
		}

		this.#container.style.height = `${Math.max(...this.#columns) - this.#currentGutterY}px`;
	}

	private resizeThrottler() {
		if (!this.#resizeTimeout) {
			this.#resizeTimeout = window.setTimeout(() => {
				this.#resizeTimeout = null;
				if (this.#container.clientWidth !== this.#width) this.layout();
			}, 33);
		}
	}
}

new MiniMasonry({
	gutter: 12,
	baseWidth: () => Math.min(350, document.documentElement.clientWidth - 16), // 16px is the padding of the masonry container on mobile
	container: document.querySelector(".masonry")!,
});
