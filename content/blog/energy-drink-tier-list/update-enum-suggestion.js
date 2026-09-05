/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from "node:fs";
import schema from "./schema.json" with { type: "json" };

const drinkDataRaw = fs.readFileSync("./drinks.jsonc", "utf8");

// Remove JSON comments with regex
const drinkData = drinkDataRaw.replace(/\/\/.*/g, "");

const drinksData = JSON.parse(drinkData);

// Extract all drink IDs from repository
const drinkIds = drinksData.repository.filter((drink) => drink.id).map((drink) => drink.id);

// Update only the enum in the ratings.items.properties.drink
schema.properties.ratings.items.properties.drink.enum = drinkIds;

// Write the updated schema back to file
fs.writeFileSync("./schema.json", JSON.stringify(schema, null, 2));

// eslint-disable-next-line no-undef
console.log(`Schema updated with ${drinkIds.length} drink IDs`);
