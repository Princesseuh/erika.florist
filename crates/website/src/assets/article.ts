function setupArticleTocObserver() {
	const tocLinks = document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']");
	if (tocLinks.length === 0) {
		return;
	}

	// Build a map from heading id -> toc link
	const linkMap = new Map<string, HTMLAnchorElement>();
	for (const link of tocLinks) {
		const href = link.getAttribute("href");
		if (href === null) {
			continue;
		}
		linkMap.set(href.slice(1), link);
	}

	const headingIds = [...linkMap.keys()];
	const headings = headingIds
		.map((id) => document.querySelector(`#${id}`))
		.filter((el): el is HTMLElement => el !== null);

	if (headings.length === 0) {
		return;
	}

	let activeId: string | null = null;

	function setActive(id: string | null) {
		if (id === activeId) {
			return;
		}
		if (activeId !== null) {
			linkMap.get(activeId)?.classList.remove("toc-active");
		}
		activeId = id;
		if (id !== null) {
			linkMap.get(id)?.classList.add("toc-active");
		}
	}

	// Track which headings are currently intersecting
	const intersecting = new Set<string>();

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const { id } = entry.target;
				if (entry.isIntersecting) {
					intersecting.add(id);
				} else {
					intersecting.delete(id);
				}
			}

			// Pick the first heading (in document order) that is intersecting
			const firstVisible = headingIds.find((id) => intersecting.has(id));
			if (firstVisible === undefined) {
				// No headings visible — find the last one that has scrolled past
				let lastPassed: string | null = null;
				for (const heading of headings) {
					if (heading.getBoundingClientRect().top < 0) {
						lastPassed = heading.id;
					} else {
						break;
					}
				}
				setActive(lastPassed);
			} else {
				setActive(firstVisible);
			}
		},
		{
			// Trigger slightly before the heading reaches the top so it activates promptly
			rootMargin: "0px 0px -80% 0px",
			threshold: 0,
		},
	);

	for (const heading of headings) {
		observer.observe(heading);
	}
}

(() => {
	const asides = document.querySelectorAll("aside");

	document.addEventListener(
		"scroll",
		() => {
			const showing =
				window.scrollY > 350 &&
				window.scrollY + window.innerHeight < document.body.scrollHeight - 250;
			for (const [i, aside] of asides.entries()) {
				aside.classList.toggle(i === 0 ? "opacity-35" : "opacity-65", showing);
			}
		},
		{
			capture: false,
			passive: true,
		},
	);

	// Intersection observer to highlight the current section in the ToC
	setupArticleTocObserver();
})();

export {};
