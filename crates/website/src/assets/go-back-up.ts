const goUp = document.querySelector<HTMLElement>("#go-up");

if (goUp) {
	goUp.addEventListener("click", () => {
		window.scrollTo({ behavior: "smooth", top: 0 });
	});

	window.addEventListener("scroll", () => {
		if (window.scrollY > 500) {
			goUp.inert = false;
			goUp.style.opacity = "0.35";
		} else {
			goUp.inert = true;
			goUp.style.opacity = "0";
		}
	});
}

export {};
