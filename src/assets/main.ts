document.addEventListener("DOMContentLoaded", () => {
	function makeDatesRelative(): void {
		const timeFormat = new Intl.RelativeTimeFormat("en");
		const dateElements = document.querySelectorAll<HTMLElement>("[data-date]");

		for (const element of dateElements) {
			if (
				element.dataset.date === "Invalid Date" ||
				element.dataset.date === undefined
			) {
				continue;
			}

			const date = new Date(element.dataset.date);
			const deltaDays = Math.round(
				(date.getTime() - Date.now()) / (1000 * 3600 * 24)
			);

			if (deltaDays === 0) {
				const deltaHours = Math.round(
					(date.getTime() - Date.now()) / (1000 * 60 * 60)
				);

				if (deltaHours === 0) {
					element.textContent = "less than an hour ago";
				} else {
					element.textContent = timeFormat.format(deltaHours, "hours");
				}
			} else {
				element.textContent = timeFormat.format(deltaDays, "days");
			}

			element.title = date.toString();
		}
	}

	makeDatesRelative();
});
