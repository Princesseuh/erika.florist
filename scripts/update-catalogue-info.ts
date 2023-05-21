import { bold } from "kleur/colors";
import { Logger } from "./catalogueUtils";
import { getDataForBooks } from "./getInfoCoverBook";
import { getDataForGames } from "./getInfoCoverGame";

const [gameCount, bookCount] = await Promise.all([getDataForGames(), getDataForBooks()]);

Logger.success(
  `Got data for ${bold(gameCount)} games and ${bold(bookCount)} books! Total: ${bold(
    gameCount + bookCount,
  )}`,
);
