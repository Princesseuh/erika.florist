function makeDatesRelative(): void {
	const timeFormat = new Intl.RelativeTimeFormat("en");
	const dateElements = document.querySelectorAll<HTMLElement>("[data-date]");

	for (const element of dateElements) {
		if (element.dataset.date === "Invalid Date" || element.dataset.date === undefined) {
			continue;
		}

		const date = new Date(element.dataset.date);
		const deltaDays = Math.round((date.getTime() - Date.now()) / (1000 * 3600 * 24));

		if (deltaDays === 0) {
			const deltaHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60));
			element.textContent =
				deltaHours === 0 ? "less than an hour ago" : timeFormat.format(deltaHours, "hours");
		} else {
			element.textContent = timeFormat.format(deltaDays, "days");
		}

		element.title = date.toString();
	}
}

document.addEventListener("DOMContentLoaded", makeDatesRelative);

export {};
