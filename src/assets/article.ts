const asides = document.querySelectorAll("aside");

document.addEventListener(
	"scroll",
	() => {
		if (
			window.scrollY > 350 &&
			window.scrollY + window.innerHeight < document.body.scrollHeight - 250
		) {
			asides.forEach((aside, i) => {
				aside.classList.toggle(i === 0 ? "opacity-35" : "opacity-65", true);
			});
		} else {
			asides.forEach((aside, i) => {
				aside.classList.toggle(i === 0 ? "opacity-35" : "opacity-65", false);
			});
		}
	},
	{
		capture: false,
		passive: true,
	}
);
