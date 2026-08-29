# erika-catalogue-mcp

MCP server exposing [Erika's catalogue](https://erika.florist/catalogue) (games, movies, shows, books) as queryable tools, over stdio.

## Install

```sh
cargo install erika-catalogue-mcp
```

Register it with Claude Code:

```sh
claude mcp add erika-catalogue --scope user -- erika-catalogue-mcp
```

## Tools

- `search_catalogue` — filter by type, status, rating, years, genre, review text; fuzzy search on title/author
- `get_entry` — full entry including the written review as Markdown
- `check_catalogue` — batch existence check by TMDb/IGDB ID or slug
- `list_recent` — recently finished entries
- `stats` — counts and average ratings per type
- `rating_summary` — rating distribution for a genre/author/type slice
- `refresh` — refetch the data, bypassing the cache
