// Adapted from https://github.com/Spope/MiniMasonry.js
// LICENSE: https://github.com/Spope/MiniMasonry.js/blob/master/LICENSE

interface MasonryConfig {
	baseWidth?: number;
	gutterX?: number;
	gutterY?: number;
	gutter?: number;
	container: HTMLElement;
	minify?: boolean;
	ultimateGutter?: number;
	surroundingGutter?: boolean;
	direction?: "ltr" | "rtl";
	wedge?: boolean;
}

type NoUndefinedField<T> = { [P in keyof T]-?: NonNullable<T[P]> };

export class MiniMasonry {
	private _sizes: number[] = [];
	private _columns: number[] = [];
	private _container: HTMLElement;
	private _count = 0;
	private _width = 0;
	private _currentGutterX: number;
	private _currentGutterY: number;
	private _resizeTimeout: number | null = null;
	private conf: NoUndefinedField<Required<MasonryConfig>>;

	constructor(conf: MasonryConfig) {
		this.conf = {
			baseWidth: 255,
			gutterX: conf.gutterX ?? conf.gutter ?? 10,
			gutterY: conf.gutterY ?? conf.gutter ?? 10,
			gutter: 10,
			minify: true,
			ultimateGutter: 5,
			surroundingGutter: true,
			direction: "ltr",
			wedge: false,
			...conf,
		};

		this._currentGutterX = this.conf.gutterX;
		this._currentGutterY = this.conf.gutterY;
		this._container = this.conf.container;

		const onResize = this.resizeThrottler.bind(this);
		window.addEventListener("resize", onResize);
		this._removeListener = () => {
			window.removeEventListener("resize", onResize);
			if (this._resizeTimeout != null) {
				window.clearTimeout(this._resizeTimeout);
				this._resizeTimeout = null;
			}
		};

		this.layout();
	}

	private reset() {
		this._sizes = [];
		this._columns = [];
		this._count = 0;
		this._width = Math.max(this._container.clientWidth, this.conf.baseWidth);

		this._currentGutterX = this.getCount() === 1 ? this.conf.ultimateGutter : this.conf.gutterX;
		if (this._width < this.conf.baseWidth + 2 * this._currentGutterX) this._currentGutterX = 0;
	}

	private getCount() {
		const totalWidth = this.conf.surroundingGutter
			? this._width - this._currentGutterX
			: this._width + this._currentGutterX;
		return Math.floor(totalWidth / (this.conf.baseWidth + this._currentGutterX));
	}

	private computeWidth() {
		const totalWidth = this.conf.surroundingGutter
			? this._width - this._currentGutterX
			: this._width + this._currentGutterX;
		return Number.parseFloat((totalWidth / this._count - this._currentGutterX).toFixed(2));
	}

	private layout() {
		this.reset();
		if (this._count === 0) this._count = this.getCount();
		const colWidth = this.computeWidth();

		this._columns = Array<number>(this._count).fill(0);
		const children = this._container.children as HTMLCollectionOf<HTMLElement>;
		const childArray = Array.from(children);
		for (const child of childArray) {
			child.style.width = `${colWidth}px`;
		}
		this._sizes = childArray.map((child) => child.clientHeight);

		let startX =
			this.conf.direction === "ltr"
				? this.conf.surroundingGutter
					? this._currentGutterX
					: 0
				: this._width - (this.conf.surroundingGutter ? this._currentGutterX : 0);
		if (this._count > this._sizes.length) {
			const occupiedSpace =
				this._sizes.length * (colWidth + this._currentGutterX) - this._currentGutterX;
			startX = this.conf.wedge
				? this.conf.direction === "ltr"
					? startX
					: this._width - this._currentGutterX
				: this.conf.direction === "ltr"
					? (this._width - occupiedSpace) / 2
					: this._width - (this._width - occupiedSpace) / 2;
		}

		let index = 0;
		for (const child of children) {
			const nextColumn = this.conf.minify
				? this._columns.indexOf(Math.min(...this._columns))
				: index % this._columns.length;
			const childrenGutter =
				this.conf.surroundingGutter || nextColumn !== this._columns.length
					? this._currentGutterX
					: 0;
			const x =
				this.conf.direction === "ltr"
					? startX + (colWidth + childrenGutter) * nextColumn
					: startX - (colWidth + childrenGutter) * nextColumn - colWidth;
			const y = this._columns[nextColumn] ?? 0;

			child.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
			this._columns[nextColumn] =
				(this._columns[nextColumn] ?? 0) +
				(this._sizes[index] ?? 0) +
				(this._count > 1 ? this.conf.gutterY : this.conf.ultimateGutter);
			index++;
		}

		this._container.style.height = `${Math.max(...this._columns) - this._currentGutterY}px`;
	}

	private resizeThrottler() {
		if (!this._resizeTimeout) {
			this._resizeTimeout = window.setTimeout(() => {
				this._resizeTimeout = null;
				if (this._container.clientWidth !== this._width) this.layout();
			}, 33);
		}
	}
}
