document.addEventListener("DOMContentLoaded", function () {
	setupTocObserver();

	function setupTocObserver() {
		const tocLinks = document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']");
		if (tocLinks.length === 0) return;

		// Build a map from heading id -> all toc links with that id (desktop + mobile)
		const linkMap = new Map<string, HTMLAnchorElement[]>();
		for (const link of tocLinks) {
			const id = link.getAttribute("href")!.slice(1);
			const existing = linkMap.get(id);
			if (existing) {
				existing.push(link);
			} else {
				linkMap.set(id, [link]);
			}
		}

		const headingIds = Array.from(linkMap.keys());
		const headings = headingIds
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);

		if (headings.length === 0) return;

		let activeId: string | null = null;

		function setActive(id: string | null) {
			if (id === activeId) return;
			if (activeId) {
				linkMap.get(activeId)?.forEach((link) => link.classList.remove("toc-active"));
			}
			activeId = id;
			if (id) {
				linkMap.get(id)?.forEach((link) => link.classList.add("toc-active"));
			}
		}

		const intersecting = new Set<string>();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = entry.target.id;
					if (entry.isIntersecting) {
						intersecting.add(id);
					} else {
						intersecting.delete(id);
					}
				}

				const firstVisible = headingIds.find((id) => intersecting.has(id));
				if (firstVisible) {
					setActive(firstVisible);
				} else {
					let lastPassed: string | null = null;
					for (const heading of headings) {
						if (heading.getBoundingClientRect().top < 0) {
							lastPassed = heading.id;
						} else {
							break;
						}
					}
					setActive(lastPassed);
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

	const leftSidebarToggleElement = document.getElementById("left-sidebar-toggle");
	const rightSidebarToggleElement = document.getElementById("right-sidebar-toggle");
	const leftSidebarElement = document.getElementById("mobile-left-sidebar");
	const rightSidebarElement = document.getElementById("mobile-right-sidebar");

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

		const leftSidebarContent = leftSidebar.querySelector("div") as HTMLElement;

		// Toggle overlay opacity
		leftSidebar.classList.toggle("opacity-0", !leftOpen);
		leftSidebar.classList.toggle("opacity-100", leftOpen);
		leftSidebar.classList.toggle("pointer-events-none", !leftOpen);

		// Toggle sidebar content transform
		if (leftSidebarContent) {
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

		const rightSidebarContent = rightSidebar.querySelector("div") as HTMLElement;

		// Toggle overlay opacity
		rightSidebar.classList.toggle("opacity-0", !rightOpen);
		rightSidebar.classList.toggle("opacity-100", rightOpen);
		rightSidebar.classList.toggle("pointer-events-none", !rightOpen);

		// Toggle sidebar content transform
		if (rightSidebarContent) {
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
		const target = event.target as HTMLElement;

		// Check if clicking on the dark overlay (the outer div with bg-black)
		if (leftOpen && target && target.id === "mobile-left-sidebar") {
			toggleLeftSidebar();
		}
		if (rightOpen && target && target.id === "mobile-right-sidebar") {
			toggleRightSidebar();
		}
	}

	leftSidebarToggle.addEventListener("click", toggleLeftSidebar);
	rightSidebarToggle.addEventListener("click", toggleRightSidebar);

	// Add click listeners to the overlay divs
	leftSidebar.addEventListener("click", closeSidebars);
	rightSidebar.addEventListener("click", closeSidebars);

	// Close right sidebar when clicking on table of contents links
	rightSidebar.addEventListener("click", function (event) {
		const target = event.target as HTMLElement;
		if (target && target.tagName === "A" && target.getAttribute("href")?.startsWith("#")) {
			if (rightOpen) {
				toggleRightSidebar();
			}
		}
	});
});
