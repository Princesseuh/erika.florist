import { getDataForBooks } from "./getInfoCoverBook";
import { getDataForGames } from "./getInfoCoverGame";

await Promise.all([getDataForGames(), getDataForBooks()]);
