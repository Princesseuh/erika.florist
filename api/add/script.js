// @ts-check

/**
 * @typedef {"game" | "tv" | "movie" | "book"} MediaType
 */

/**
 * @type {{name: string, id: string, poster_path: string}[]}
 */
let suggestions = [];

document.addEventListener("DOMContentLoaded", async () => {
	/**
	 * @type {HTMLInputElement | null}
	 */
	const nameInput = document.querySelector("#name");
	/**
	 * @type {HTMLInputElement | null}
	 */
	const sourceIdInput = document.querySelector("#source-id");

	/**
	 * @type {HTMLSpanElement | null}
	 */
	const loader = document.querySelector(".loader");

	/**
	 * @type {HTMLInputElement | null}
	 */
	const typeInput = document.querySelector("#type");

	if (!nameInput || !sourceIdInput || !typeInput || !loader) {
		return;
	}

	let nameInputTimeout;
	let preventChange = false;

	nameInput.addEventListener("input", async () => {
		if (preventChange) {
			return;
		}

		if (nameInputTimeout) {
			clearTimeout(nameInputTimeout);
		}

		if (nameInput.value.length < 3 || !nameInput.value) {
			suggestions = [];
			return;
		}

		nameInputTimeout = setTimeout(async () => {
			loader.style.display = "block";

			await getDataForType(
				/**
				 * @type {MediaType}
				 */
				(typeInput.value),
				nameInput.value,
			);
			loader.style.display = "none";
		}, 500);
	});

	nameInput.addEventListener("change", async () => {
		clearTimeout(nameInputTimeout);
		preventChange = true;
		const selectedSuggestion = suggestions.find(
			(suggestion) => suggestion.id.toString() === nameInput.value,
		);

		if (selectedSuggestion) {
			nameInput.value = selectedSuggestion?.name;

			if (selectedSuggestion.poster_path) {
				const body = document.querySelector("body");
				body?.setAttribute(
					"style",
					`background: linear-gradient(#ffffffe6, #ffffffe6), url(${selectedSuggestion.poster_path});	background-size: contain; background-repeat: round repeat;`,
				);
			}

			sourceIdInput.value = selectedSuggestion.id;
		}

		preventChange = false;
	});

	typeInput.addEventListener("change", async () => {
		clearTimeout(nameInputTimeout);
		suggestions = [];
	});
});

/**
 * @param {MediaType} type
 * @param {string} query
 */
async function getDataForType(type, query) {
	switch (type) {
		case "game": {
			const response = await fetch(`${window.location.href}?type=${type}&query=${query}`, {
				headers: { Accept: "application/json", "x-proxy-source": "igdb" },
			});
			const responseData = await response.json();

			suggestions = responseData.map((result) => ({
				name: result.name,
				id: result.id,
				poster_path: result.cover && result.cover.url.replace("t_thumb", "t_cover_big"),
			}));

			break;
		}
		case "tv":
		case "movie": {
			const response = await fetch(`${window.location.href}?type=${type}&query=${query}`, {
				headers: { Accept: "application/json", "x-proxy-source": "tmdb" },
			});
			const responseData = await response.json();

			suggestions = responseData.results.map((result) => ({
				name: result.title ?? result.name,
				id: result.id,
				poster_path: "https://image.tmdb.org/t/p/w300/" + result.poster_path,
				type,
			}));

			break;
		}
		case "book":
			break;
	}

	updateSuggestionList();
}

function updateSuggestionList() {
	const suggestionDatalist = document.querySelector("#name-list");

	if (suggestionDatalist) {
		suggestionDatalist.innerHTML = "";

		for (const suggestion of suggestions) {
			const option = document.createElement("option");
			option.value = suggestion.id;
			option.label = suggestion.name;
			suggestionDatalist.appendChild(option);
		}
	}
}
