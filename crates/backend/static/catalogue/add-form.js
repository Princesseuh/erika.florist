// @ts-check

/**
 * @typedef {"game" | "tv" | "movie" | "book"} MediaType
 */

/**
 * @type {{name: string, id: string, poster_path: string}[]}
 */
let suggestions = [];

document.addEventListener("DOMContentLoaded", () => {
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
	 * @type {HTMLDivElement | null}
	 */
	const platform = document.querySelector("#platform");

	/**
	 * @type {HTMLSelectElement | null}
	 */
	const platformSelect = document.querySelector("#platform-select");

	/**
	 * @type {HTMLInputElement | null}
	 */
	const typeInput = document.querySelector("#type");

	/**
	 * @type {HTMLInputElement | null}
	 */
	const nodateCheckbox = document.querySelector("#no-date");

	/**
	 * @type {HTMLInputElement | null}
	 * */
	const dateInput = document.querySelector("#date");

	if (
		!nameInput ||
		!sourceIdInput ||
		!typeInput ||
		!loader ||
		!platform ||
		!platformSelect ||
		!nodateCheckbox ||
		!dateInput
	) {
		console.error("Missing required elements:");
		console.error("nameInput", nameInput);
		console.error("sourceIdInput", sourceIdInput);
		console.error("typeInput", typeInput);
		console.error("loader", loader);
		console.error("platform", platform);
		console.error("platformSelect", platformSelect);
		console.error("nodateCheckbox", nodateCheckbox);
		console.error("dateInput", dateInput);
		return;
	}

	/**
	 * @type {ReturnType<typeof setTimeout>}
	 */
	let nameInputTimeout;
	let preventChange = false;

	nameInput.addEventListener("input", () => {
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

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
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

	nameInput.addEventListener("change", () => {
		clearTimeout(nameInputTimeout);
		preventChange = true;
		const selectedSuggestion = suggestions.find(
			(suggestion) => suggestion.id.toString() === nameInput.value,
		);

		if (selectedSuggestion) {
			nameInput.value = selectedSuggestion.name;
			sourceIdInput.value = selectedSuggestion.id;

			// Update cover preview
			if (selectedSuggestion.poster_path) {
				const coverPreview = /** @type {HTMLElement | null} */ (
					document.querySelector("#cover-preview")
				);
				const coverImage = /** @type {HTMLImageElement | null} */ (
					document.querySelector("#cover-image")
				);
				if (coverPreview && coverImage) {
					coverImage.src = selectedSuggestion.poster_path;
					coverPreview.classList.add("show");
				}

				// Set background image on body for mobile
				const body = document.querySelector("body");
				const isMobile = window.matchMedia("only screen and (max-width: 760px)").matches;
				if (body && isMobile) {
					body.setAttribute(
						"style",
						`background: linear-gradient(#ffffffe6, #ffffffe6), url(${selectedSuggestion.poster_path}); background-size: contain; background-repeat: round repeat;`,
					);
				}
			}

			// Update selected info
			const selectedInfo = document.querySelector("#selected-info");
			const selectedTitle = document.querySelector("#selected-title");
			const selectedId = document.querySelector("#selected-id");
			if (selectedInfo && selectedTitle && selectedId) {
				selectedTitle.textContent = selectedSuggestion.name;
				selectedId.textContent = `ID: ${selectedSuggestion.id}`;
				selectedInfo.classList.remove("hidden");
			}
		}

		preventChange = false;
	});

	typeInput.addEventListener("change", () => {
		clearTimeout(nameInputTimeout);
		suggestions = [];

		if (typeInput.value === "game" || typeInput.value === "book") {
			updatePlaformSelect(typeInput.value, platformSelect);
			platform.classList.remove("hidden");
		} else {
			platformSelect.innerHTML = "";
			platformSelect.value = "";
			platform.classList.add("hidden");
		}
	});

	nodateCheckbox.addEventListener("change", () => {
		if (nodateCheckbox.checked) {
			dateInput.removeAttribute("disabled");
			dateInput.type = "date";
			// @ts-expect-error - zzz
			dateInput.value = new Date().toISOString().split("T")[0];
		} else {
			dateInput.setAttribute("disabled", "true");
			dateInput.type = "text";
			dateInput.value = "N/A";
		}
	});
});

/**
 *
 * @param {MediaType} type
 * @param {HTMLSelectElement} platformSelect
 */
function updatePlaformSelect(type, platformSelect) {
	switch (type) {
		case "game":
			platformSelect.innerHTML = `
        <option value="pc">PC</option>
        <option value="switch">Switch</option>
        <option value="mobile">Mobile</option>
        <option value="ps3">PS3</option>
        <option value="ps4">PS4</option>
        <option value="ps5">PS5</option>
        <option value="ds">DS</option>
        <option value="gcn">GameCube</option>
      `;
			break;
		case "book":
			platformSelect.innerHTML = `
        <option value="ebook">E-Book</option>
        <option value="physical">Physical</option>
        <option value="audiobook">Audiobook</option>
      `;
			break;
		case "tv":
		case "movie":
			break;
	}
}

/**
 * @param {MediaType} type
 * @param {string} query
 */
async function getDataForType(type, query) {
	switch (type) {
		case "game": {
			const response = await fetch(
				`/catalogue/proxy?type=${type}&query=${encodeURIComponent(query)}`,
				{
					headers: { Accept: "application/json", "x-proxy-source": "igdb" },
				},
			);
			const responseData = await response.json();

			suggestions = responseData.map(
				(/** @type {{ name: any; id: any; cover?: { url: string; }; }} */ result) => ({
					name: result.name,
					id: result.id,
					poster_path: result.cover?.url.replace("t_thumb", "t_cover_big"),
				}),
			);

			break;
		}
		case "tv":
		case "movie": {
			const response = await fetch(
				`/catalogue/proxy?type=${type}&query=${encodeURIComponent(query)}`,
				{
					headers: { Accept: "application/json", "x-proxy-source": "tmdb" },
				},
			);
			const responseData = await response.json();

			suggestions = responseData.results.map(
				(
					/** @type {{ title: string | undefined; name: string | undefined; id: any; poster_path: string; }} */ result,
				) => ({
					name: result.title ?? result.name,
					id: result.id,
					poster_path: `https://image.tmdb.org/t/p/w300/${result.poster_path}`,
					type,
				}),
			);

			break;
		}
		case "book": {
			// Return open library search
			const response = await fetch(
				`/catalogue/proxy?type=${type}&query=${encodeURIComponent(query)}`,
				{
					headers: { Accept: "application/json", "x-proxy-source": "isbn" },
				},
			);

			const responseData = await response.json();

			suggestions = responseData.docs.map(
				(
					/** @type {{ title: string; key: string; cover_i: number; isbn: string[], editions: {docs: { isbn: string[]}[]}[]; }} */ result,
				) => {
					return {
						name: result.title,
						id: result.editions?.[0]?.docs?.[0]?.isbn?.[0] ?? result.isbn?.[0] ?? "UNKNOWN",
						poster_path: `http://covers.openlibrary.org/b/id/${result.cover_i}-L.jpg`,
					};
				},
			);

			break;
		}
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
