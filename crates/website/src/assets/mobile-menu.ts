document.addEventListener("DOMContentLoaded", function onDOMContentLoaded() {
	const menuButton = document.querySelector("#mobile-menu-button");
	const panel = document.querySelector("#mobile-menu-panel");
	const hamburgerIcon = document.querySelector("#hamburger-icon");
	const closeIcon = document.querySelector("#close-icon");
	let isOpen = false;

	function toggleMenu() {
		if (!panel) {
			return;
		}

		isOpen = !isOpen;

		panel.classList.toggle("-translate-x-4", !isOpen);
		panel.classList.toggle("opacity-0", !isOpen);
		panel.classList.toggle("pointer-events-none", !isOpen);

		if (hamburgerIcon) {
			hamburgerIcon.classList.toggle("hidden", isOpen);
		}
		if (closeIcon) {
			closeIcon.classList.toggle("hidden", !isOpen);
		}

		document.body.style.overflow = isOpen ? "hidden" : "";
	}

	menuButton?.addEventListener("click", toggleMenu);
});
