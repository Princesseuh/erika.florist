function schemaToForm(schema, container, initialValues = {}) {
	const form = document.createElement("form");
	form.className = "schema-form space-y-6";

	// Store schema reference for $ref resolution
	form._schema = schema;

	const props = schema.properties || {};
	const required = schema.required || [];

	for (const [key, definition] of Object.entries(props)) {
		const wrapper = document.createElement("div");
		wrapper.className = "field-wrapper space-y-2";

		const labelContainer = document.createElement("div");
		labelContainer.className = "flex items-center space-x-2";

		const label = document.createElement("label");
		label.textContent = formatLabel(key);
		label.setAttribute("for", key);
		label.className = "text-sm font-medium text-gray-700";

		// Add description if available
		if (definition.description) {
			const description = document.createElement("small");
			description.textContent = definition.description;
			description.className = "field-description block text-xs text-gray-500 mt-1";
			label.appendChild(document.createElement("br"));
			label.appendChild(description);
		}

		labelContainer.appendChild(label);

		const fieldContainer = createField(
			key,
			definition,
			required.includes(key),
			initialValues[key],
			labelContainer,
			schema,
		);
		wrapper.appendChild(labelContainer);
		wrapper.appendChild(fieldContainer);
		form.appendChild(wrapper);
	}

	// Add form submission handler
	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const data = getFormData(form, schema);
		if (form.onSubmit) {
			form.onSubmit(data);
		}
	});

	container.innerHTML = "";
	container.appendChild(form);

	return form;
}

function createField(key, definition, isRequired, initialValue, labelContainer, schema) {
	const container = document.createElement("div");
	container.className = "field-container";

	// Resolve $ref if present
	definition = resolveRef(definition, schema);

	// Handle nullable types (union with null)
	const isNullable = isNullableType(definition);
	let actualDefinition = isNullable ? getNonNullDefinition(definition) : definition;

	// Create nullable checkbox if field is nullable - add to label container
	if (isNullable && !isRequired) {
		const nullCheckbox = document.createElement("input");
		nullCheckbox.type = "checkbox";
		nullCheckbox.id = `${key}_is_null`;
		nullCheckbox.className = "h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded";

		// Set initial state - checked means has value, unchecked means null
		if (initialValue !== null && initialValue !== undefined) {
			nullCheckbox.checked = true;
		}

		labelContainer.appendChild(nullCheckbox);

		nullCheckbox.addEventListener("change", () => {
			const fieldInput = container.querySelector(
				`.main-input, .array-container, .object-container`,
			);
			if (fieldInput) {
				fieldInput.style.display = nullCheckbox.checked ? "block" : "none";
				fieldInput.disabled = !nullCheckbox.checked;
				if (!nullCheckbox.checked) {
					fieldInput.classList.add("opacity-50");
				} else {
					fieldInput.classList.remove("opacity-50");
				}
			}
		});
	}

	let input = createInputForType(
		key,
		actualDefinition,
		isRequired,
		initialValue === null ? undefined : initialValue,
		schema,
	);
	input.classList.add("main-input");

	// If initial value is null/undefined and field is nullable, hide the input initially
	if ((initialValue === null || initialValue === undefined) && isNullable && !isRequired) {
		input.style.display = "none";
		input.disabled = true;
		input.classList.add("opacity-50");
	}

	container.appendChild(input);
	return container;
}

function createInputForType(key, definition, isRequired, initialValue, schema) {
	if (definition.enum) {
		return createEnumSelect(key, definition, isRequired, initialValue);
	}

	// If no type is specified but we have an object value or object properties, treat as object
	if (
		!definition.type &&
		((initialValue &&
			typeof initialValue === "object" &&
			!Array.isArray(initialValue) &&
			initialValue !== null) ||
			definition.properties)
	) {
		return createObjectInput(
			key,
			{ ...definition, type: "object" },
			isRequired,
			initialValue,
			schema,
		);
	}

	// If no type is specified but we have an array value or array items, treat as array
	if (!definition.type && (Array.isArray(initialValue) || definition.items)) {
		return createArrayInput(
			key,
			{ ...definition, type: "array" },
			isRequired,
			initialValue,
			schema,
		);
	}

	switch (definition.type) {
		case "string":
			return createStringInput(key, definition, isRequired, initialValue);
		case "number":
		case "integer":
			return createNumberInput(key, definition, isRequired, initialValue);
		case "boolean":
			return createBooleanInput(key, definition, isRequired, initialValue);
		case "array":
			return createArrayInput(key, definition, isRequired, initialValue, schema);
		case "object":
			return createObjectInput(key, definition, isRequired, initialValue, schema);
		default:
			return createStringInput(key, definition, isRequired, initialValue);
	}
}

function createStringInput(key, definition, isRequired, initialValue) {
	let input;

	if (definition.format === "textarea" || (definition.maxLength && definition.maxLength > 100)) {
		input = document.createElement("textarea");
		input.rows = 3;
		input.className =
			"mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-vertical";
	} else {
		input = document.createElement("input");
		input.type = getStringInputType(definition.format);
		input.className =
			"mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500";
	}

	input.id = key;
	input.name = key;

	if (definition.minLength) input.minLength = definition.minLength;
	if (definition.maxLength) input.maxLength = definition.maxLength;
	if (definition.pattern) input.pattern = definition.pattern;

	// Set value from initial value or default
	if (initialValue !== undefined) {
		if (typeof initialValue === "object" && initialValue !== null) {
			input.value = JSON.stringify(initialValue, null, 2);
		} else {
			input.value = initialValue;
		}
	} else if (definition.default !== undefined) {
		if (typeof definition.default === "object" && definition.default !== null) {
			input.value = JSON.stringify(definition.default, null, 2);
		} else {
			input.value = definition.default;
		}
	}

	if (isRequired) input.required = true;

	return input;
}

function createNumberInput(key, definition, isRequired, initialValue) {
	const input = document.createElement("input");
	input.type = "number";
	input.id = key;
	input.name = key;
	input.className =
		"mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500";

	if (definition.minimum !== undefined) input.min = definition.minimum;
	if (definition.maximum !== undefined) input.max = definition.maximum;
	if (definition.type === "integer") input.step = "1";

	// Set value from initial value or default
	if (initialValue !== undefined) {
		input.value = initialValue;
	} else if (definition.default !== undefined) {
		input.value = definition.default;
	}

	if (isRequired) input.required = true;

	return input;
}

function createBooleanInput(key, definition, isRequired, initialValue) {
	const wrapper = document.createElement("div");
	wrapper.className = "flex items-center";

	const input = document.createElement("input");
	input.type = "checkbox";
	input.id = key;
	input.name = key;
	input.className = "h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded";

	// Set checked state from initial value or default
	if (initialValue !== undefined) {
		input.checked = initialValue;
	} else if (definition.default === true) {
		input.checked = true;
	}

	const label = document.createElement("label");
	label.setAttribute("for", key);
	label.textContent = "";
	label.className = "ml-2 block text-sm text-gray-700";

	wrapper.appendChild(input);
	wrapper.appendChild(label);

	return wrapper;
}

function createEnumSelect(key, definition, isRequired, initialValue) {
	const select = document.createElement("select");
	select.id = key;
	select.name = key;
	select.className =
		"mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500";

	if (!isRequired) {
		const emptyOption = document.createElement("option");
		emptyOption.value = "";
		emptyOption.textContent = "-- Select --";
		emptyOption.className = "text-gray-400";
		select.appendChild(emptyOption);
	}

	definition.enum.forEach((value) => {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = value;

		// Set selected state from initial value or default
		if (initialValue !== undefined) {
			if (initialValue === value) option.selected = true;
		} else if (definition.default === value) {
			option.selected = true;
		}

		select.appendChild(option);
	});

	if (isRequired) select.required = true;

	return select;
}

function createArrayInput(key, definition, isRequired, initialValue, schema) {
	const container = document.createElement("div");
	container.className = "array-container border border-gray-200 rounded-lg p-4 bg-gray-50";
	container.id = key;

	const header = document.createElement("div");
	header.className = "flex items-center justify-between mb-3";

	const title = document.createElement("h4");
	title.textContent = `${formatLabel(key)} Items`;
	title.className = "text-sm font-medium text-gray-700";

	const addButton = document.createElement("button");
	addButton.type = "button";
	addButton.textContent = `+ Add ${definition.items?.type || "Item"}`;
	addButton.className =
		"add-array-item bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-1 px-3 rounded transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2";

	header.appendChild(title);
	header.appendChild(addButton);

	const itemsContainer = document.createElement("div");
	itemsContainer.className = "array-items space-y-3";

	addButton.addEventListener("click", () => {
		addArrayItem(itemsContainer, definition.items, key, undefined, schema);
	});

	container.appendChild(header);
	container.appendChild(itemsContainer);

	// Add initial items from initialValue, default, or if required
	const itemsToAdd = initialValue || definition.default || (isRequired ? [undefined] : []);

	if (itemsToAdd.length > 0) {
		itemsToAdd.forEach((itemValue) =>
			addArrayItem(itemsContainer, definition.items, key, itemValue, schema),
		);
	}

	return container;
}

function addArrayItem(container, itemDefinition, parentKey, itemValue, schema) {
	const itemWrapper = document.createElement("div");
	itemWrapper.className =
		"array-item flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded";

	const itemInput = createInputForType(
		`${parentKey}_item_${Date.now()}`,
		itemDefinition,
		false,
		itemValue,
		schema,
	);
	itemInput.name = `${parentKey}[]`;
	itemInput.className = itemInput.className.replace("mt-1", "");

	const removeButton = document.createElement("button");
	removeButton.type = "button";
	removeButton.textContent = "×";
	removeButton.className =
		"remove-array-item flex-shrink-0 bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2";
	removeButton.addEventListener("click", () => {
		container.removeChild(itemWrapper);
	});

	const inputWrapper = document.createElement("div");
	inputWrapper.className = "flex-1";
	inputWrapper.appendChild(itemInput);

	itemWrapper.appendChild(inputWrapper);
	itemWrapper.appendChild(removeButton);
	container.appendChild(itemWrapper);
}

function createObjectInput(key, definition, isRequired, initialValue, schema) {
	const container = document.createElement("div");
	container.className = "object-container border border-gray-200 rounded-lg bg-gray-50";
	container.id = key;

	const fieldset = document.createElement("fieldset");
	fieldset.className = "p-4";

	const propertiesContainer = document.createElement("div");
	propertiesContainer.className = "space-y-4";

	if (definition.properties) {
		const objectRequired = definition.required || [];
		const objectInitialValue = initialValue || {};

		for (const [propKey, propDefinition] of Object.entries(definition.properties)) {
			const propWrapper = document.createElement("div");
			propWrapper.className = "object-property";

			const propLabel = document.createElement("label");
			propLabel.textContent = formatLabel(propKey);
			propLabel.setAttribute("for", `${key}.${propKey}`);
			propLabel.className = "block text-sm font-medium text-gray-600 mb-1";

			const propInput = createInputForType(
				`${key}.${propKey}`,
				propDefinition,
				objectRequired.includes(propKey),
				objectInitialValue[propKey],
				schema,
			);
			propInput.name = `${key}.${propKey}`;

			propWrapper.appendChild(propLabel);
			propWrapper.appendChild(propInput);
			propertiesContainer.appendChild(propWrapper);
		}
	}

	fieldset.appendChild(propertiesContainer);
	container.appendChild(fieldset);
	return container;
}

function resolveRef(definition, schema) {
	if (definition.$ref) {
		const refPath = definition.$ref;
		if (!refPath.startsWith("#/")) {
			// Only handle internal references for now
			return definition;
		}

		const path = refPath.slice(2).split("/"); // Remove "#/" and split
		let resolved = schema;

		for (const segment of path) {
			if (resolved && typeof resolved === "object" && segment in resolved) {
				resolved = resolved[segment];
			} else {
				// Reference not found, return original
				return definition;
			}
		}

		return resolved || definition;
	}

	// Handle anyOf/oneOf schemas that might contain $ref
	if (definition.anyOf || definition.oneOf) {
		const schemas = definition.anyOf || definition.oneOf;
		const resolvedSchemas = schemas.map((subSchema) => resolveRef(subSchema, schema));
		return {
			...definition,
			[definition.anyOf ? "anyOf" : "oneOf"]: resolvedSchemas,
		};
	}

	return definition;
}

function isNullableType(definition) {
	if (Array.isArray(definition.type)) {
		return definition.type.includes("null");
	}
	if (definition.anyOf || definition.oneOf) {
		const schemas = definition.anyOf || definition.oneOf;
		return schemas.some((schema) => schema.type === "null");
	}
	return false;
}

function getNonNullDefinition(definition) {
	if (Array.isArray(definition.type)) {
		const nonNullTypes = definition.type.filter((type) => type !== "null");
		return { ...definition, type: nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes };
	}
	if (definition.anyOf || definition.oneOf) {
		const schemas = definition.anyOf || definition.oneOf;
		const nonNullSchema = schemas.find((schema) => schema.type !== "null");
		// Return the non-null schema, preserving any additional properties from the parent
		if (nonNullSchema) {
			const { anyOf, oneOf, ...parentProps } = definition;
			return { ...parentProps, ...nonNullSchema };
		}
		return definition;
	}
	return definition;
}

function getStringInputType(format) {
	switch (format) {
		case "email":
			return "email";
		case "uri":
		case "url":
			return "url";
		case "date":
			return "date";
		case "time":
			return "time";
		case "date-time":
			return "datetime-local";
		case "password":
			return "password";
		case "color":
			return "color";
		default:
			return "text";
	}
}

function formatLabel(key) {
	return key.replace(/[_-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getFormData(form, schema) {
	const formData = new FormData(form);
	const data = {};
	const props = schema.properties || {};

	for (const [key, definition] of Object.entries(props)) {
		const nullCheckbox = form.querySelector(`#${key}_is_null`);

		if (nullCheckbox && !nullCheckbox.checked) {
			data[key] = null;
			continue;
		}

		if (definition.type === "array") {
			const arrayValues = formData.getAll(`${key}[]`);
			data[key] = arrayValues.map((value) => convertValue(value, definition.items));
		} else if (definition.type === "object") {
			data[key] = {};
			for (const [propKey] of Object.entries(definition.properties || {})) {
				const propValue = formData.get(`${key}.${propKey}`);
				if (propValue !== null) {
					data[key][propKey] = convertValue(propValue, definition.properties[propKey]);
				}
			}
		} else {
			const value = formData.get(key);
			data[key] = convertValue(value, definition);
		}
	}

	return data;
}

function convertValue(value, definition) {
	if (value === null || value === "") return null;

	switch (definition?.type) {
		case "number":
			return parseFloat(value);
		case "integer":
			return parseInt(value, 10);
		case "boolean":
			return value === "on" || value === "true";
		default:
			// Try to parse as JSON if it looks like a JSON object/array
			if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
				try {
					return JSON.parse(value);
				} catch {
					return value;
				}
			}
			return value;
	}
}
