function setupWikiTocObserver() {
	const tocLinks = document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']");
	if (tocLinks.length === 0) {
		return;
	}

	// Build a map from heading id -> all toc links with that id (desktop + mobile)
	const linkMap = new Map<string, HTMLAnchorElement[]>();
	for (const link of tocLinks) {
		const href = link.getAttribute("href");
		if (href === null) {
			continue;
		}
		const id = href.slice(1);
		const existing = linkMap.get(id);
		if (existing) {
			existing.push(link);
		} else {
			linkMap.set(id, [link]);
		}
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
			const links = linkMap.get(activeId);
			if (links !== undefined) {
				for (const link of links) {
					link.classList.remove("toc-active");
				}
			}
		}
		activeId = id;
		if (id !== null) {
			const links = linkMap.get(id);
			if (links !== undefined) {
				for (const link of links) {
					link.classList.add("toc-active");
				}
			}
		}
	}

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

			const firstVisible = headingIds.find((id) => intersecting.has(id));
			if (firstVisible === undefined) {
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
			rootMargin: "0px 0px -80% 0px",
			threshold: 0,
		},
	);

	for (const heading of headings) {
		observer.observe(heading);
	}
}

document.addEventListener("DOMContentLoaded", function onDOMContentLoaded() {
	setupWikiTocObserver();

	const leftSidebarToggleElement = document.querySelector<HTMLElement>("#left-sidebar-toggle");
	const rightSidebarToggleElement = document.querySelector<HTMLElement>("#right-sidebar-toggle");
	const leftSidebarElement = document.querySelector<HTMLElement>("#mobile-left-sidebar");
	const rightSidebarElement = document.querySelector<HTMLElement>("#mobile-right-sidebar");

	// Early return if required elements are not found
	if (!leftSidebarToggleElement || !leftSidebarElement) {
		console.warn("Left sidebar elements not found in the DOM");
		return;
	}

	// If right sidebar toggle doesn't exist, hide the button via CSS
	if (!rightSidebarToggleElement) {
		return;
	}

	// If right sidebar doesn't exist, hide the toggle button
	if (!rightSidebarElement) {
		rightSidebarToggleElement.style.display = "none";
		return;
	}

	// Now we can safely assign to non-nullable variables
	const leftSidebarToggle = leftSidebarToggleElement;
	const rightSidebarToggle = rightSidebarToggleElement;
	const leftSidebar = leftSidebarElement;
	const rightSidebar = rightSidebarElement;

	let leftOpen = false;
	let rightOpen = false;

	function toggleLeftSidebar() {
		leftOpen = !leftOpen;

		const leftSidebarContent = leftSidebar.querySelector<HTMLElement>("div");

		// Toggle overlay opacity
		leftSidebar.classList.toggle("opacity-0", !leftOpen);
		leftSidebar.classList.toggle("opacity-100", leftOpen);
		leftSidebar.classList.toggle("pointer-events-none", !leftOpen);

		// Toggle sidebar content transform
		if (leftSidebarContent !== null) {
			leftSidebarContent.classList.toggle("-translate-x-full", !leftOpen);
			leftSidebarContent.classList.toggle("translate-x-0", leftOpen);
		}

		if (leftOpen) {
			document.body.style.overflow = "hidden";
		} else if (!rightOpen) {
			document.body.style.overflow = "";
		}
	}

	function toggleRightSidebar() {
		rightOpen = !rightOpen;

		const rightSidebarContent = rightSidebar.querySelector<HTMLElement>("div");

		// Toggle overlay opacity
		rightSidebar.classList.toggle("opacity-0", !rightOpen);
		rightSidebar.classList.toggle("opacity-100", rightOpen);
		rightSidebar.classList.toggle("pointer-events-none", !rightOpen);

		// Toggle sidebar content transform
		if (rightSidebarContent !== null) {
			rightSidebarContent.classList.toggle("translate-x-full", !rightOpen);
			rightSidebarContent.classList.toggle("translate-x-0", rightOpen);
		}

		if (rightOpen) {
			document.body.style.overflow = "hidden";
		} else if (!leftOpen) {
			document.body.style.overflow = "";
		}
	}

	// Close sidebars when clicking on the dark overlay
	function closeSidebars(event: MouseEvent) {
		if (!(event.target instanceof HTMLElement)) {
			return;
		}
		const { target } = event;

		// Check if clicking on the dark overlay (the outer div with bg-black)
		if (leftOpen && target.id === "mobile-left-sidebar") {
			toggleLeftSidebar();
		}
		if (rightOpen && target.id === "mobile-right-sidebar") {
			toggleRightSidebar();
		}
	}

	leftSidebarToggle.addEventListener("click", toggleLeftSidebar);
	rightSidebarToggle.addEventListener("click", toggleRightSidebar);

	// Add click listeners to the overlay divs
	leftSidebar.addEventListener("click", closeSidebars);
	rightSidebar.addEventListener("click", closeSidebars);

	// Close right sidebar when clicking on table of contents links
	rightSidebar.addEventListener("click", function onRightSidebarClick(event) {
		if (!(event.target instanceof HTMLElement)) {
			return;
		}
		const { target } = event;
		if (
			rightOpen &&
			target.tagName === "A" &&
			(target.getAttribute("href")?.startsWith("#") ?? false)
		) {
			toggleRightSidebar();
		}
	});
});

export {};
