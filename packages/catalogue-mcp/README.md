# @princesseuh/catalogue-mcp

An MCP server for [Erika's catalogue](https://erika.florist/catalogue/). A list of all the games, movies, TV shows, and books Erika has consumed, with her ratings and reviews.

## Install

### Claude Desktop

Open the Claude menu > Settings > Developer > **Edit Config**. Claude Desktop opens `claude_desktop_config.json` for you (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`). Add:

```json
{
	"mcpServers": {
		"erika-catalogue": {
			"command": "npx",
			"args": ["-y", "@princesseuh/catalogue-mcp"]
		}
	}
}
```

Restart Claude Desktop to pick up the change.

### Claude Code

Run:

```sh
claude mcp add --transport stdio erika-catalogue -- npx -y @princesseuh/catalogue-mcp
```

That writes to `~/.claude.json` by default. Add `--scope project` to write to `.mcp.json` in the current repo instead.

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.erika-catalogue]
command = "npx"
args = ["-y", "@princesseuh/catalogue-mcp"]
```

### opencode

Add to `~/.config/opencode/opencode.json` (or a project-level `opencode.json`):

```json
{
	"$schema": "https://opencode.ai/config.json",
	"mcp": {
		"erika-catalogue": {
			"type": "local",
			"command": ["npx", "-y", "@princesseuh/catalogue-mcp"],
			"enabled": true
		}
	}
}
```

The first call fetches `https://erika.florist/catalogue/mcp.json` and caches it to `~/.cache/erika-catalogue-mcp/data.json` for 24 hours, unless the `--refresh` flag is passed.

### Environment variables

- `CATALOGUE_URL`: override the JSON source. For local development: `http://localhost:8080/catalogue/mcp.json`.

## Tools

### `search_catalogue`

Filter the catalogue. All inputs are optional.

| field             | type                                    | notes                                                        |
| ----------------- | --------------------------------------- | ------------------------------------------------------------ |
| `type`            | `"game" \| "movie" \| "show" \| "book"` | restrict to one type                                         |
| `rating_at_least` | `0..5`                                  | 0=Hated, 1=Disliked, 2=Okay, 3=Liked, 4=Loved, 5=Masterpiece |
| `year`            | integer                                 | exact original release year                                  |
| `year_after`      | integer                                 | released in or after this year (inclusive)                   |
| `year_before`     | integer                                 | released in or before this year (inclusive)                  |
| `finished_year`   | integer                                 | year the media was consumed                                  |
| `finished_after`  | `YYYY-MM-DD`                            | finished on/after this date                                  |
| `finished_before` | `YYYY-MM-DD`                            | finished on/before this date                                 |
| `genre`           | string                                  | case-insensitive substring match                             |
| `query`           | string                                  | fuzzy match on title or author, ranked by relevance          |
| `mentions`        | string                                  | substring match on the review body                           |
| `limit`           | 1–200 (default 50)                      |                                                              |

Returns summaries (id, title, rating, dates, author). Call `get_entry` for the full review.

### `get_entry`

Returns one full catalogue entry, with the written review as raw Markdown in `content`.

- `type`: `"game" | "movie" | "show" | "book"`
- `id`: entry slug, e.g. `hotline-miami`

### `list_recent`

Recently-finished entries, newest first.

- `type`: optional filter
- `limit`: 1–100 (default 20)

### `stats`

Counts per type, average rating per type, and the latest finished date.

### `refresh`

Refetch the catalogue from the live endpoint, bypassing the 24h cache. Use this if the catalogue has new entries since the server started.

## Examples

```js
// "What games did I like that came out in 2026?"
search_catalogue({ type: "game", rating_at_least: 3, year: 2026 });

// "Show me my recent movie ratings."
list_recent({ type: "movie", limit: 10 });

// "What did I think of Hotline Miami?"
get_entry({ type: "game", id: "hotline-miami" });
```

## Development

```sh
pnpm install
pnpm build       # compile to dist/
pnpm dev         # watch mode
```

Point at a local website build:

```sh
CATALOGUE_URL=http://localhost:8080/catalogue/mcp.json node dist/index.js
```
