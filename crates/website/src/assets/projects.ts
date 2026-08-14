// masonry.ts exposes this once its module runs; it re-flows every .masonry container.
function relayoutMasonry(): void {
	const fn = (window as unknown as { recalculateMasonry?: () => void }).recalculateMasonry;
	if (typeof fn === "function") {
		fn();
	}
}

function setupFilters(list: HTMLElement): void {
	// The sidebar is rendered twice (desktop aside + mobile menu), so every group has two copies.
	const buttons = [...document.querySelectorAll<HTMLButtonElement>("button[data-filter]")];
	const cards = [...list.querySelectorAll<HTMLElement>(":scope > *")];
	const empties = [...document.querySelectorAll<HTMLElement>("[data-project-empty]")];
	const selected = new Map<string, string>();

	const apply = () => {
		let visible = 0;

		for (const card of cards) {
			const matches = [...selected].every(
				([name, value]) => value === "" || card.getAttribute(`data-project-${name}`) === value,
			);
			card.style.display = matches ? "" : "none";
			if (matches) {
				visible += 1;
			}
		}

		for (const empty of empties) {
			empty.classList.toggle("hidden", visible > 0);
		}
		relayoutMasonry();
	};

	for (const button of buttons) {
		const name = button.dataset.filter;
		const value = button.dataset.value ?? "";
		if (name === undefined) {
			continue;
		}

		if (!selected.has(name)) {
			selected.set(name, "");
		}

		button.addEventListener("click", () => {
			selected.set(name, value);

			for (const sibling of buttons) {
				if (sibling.dataset.filter === name) {
					sibling.setAttribute("aria-pressed", String(sibling.dataset.value === value));
				}
			}

			apply();
		});
	}
}

const list = document.querySelector<HTMLElement>("#project-list");

if (list) {
	setupFilters(list);
}
