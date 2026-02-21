const goUp = document.getElementById("go-up");

if (goUp) {
	goUp.addEventListener("click", () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
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
