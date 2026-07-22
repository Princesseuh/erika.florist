-- Scratch-map storage. Run once against the D1 database:
--   wrangler d1 execute scratchmap --remote --file=schema.sql

-- The set of visited H3 res-11 cell IDs. INSERT OR IGNORE dedups, so re-visiting a
-- cell writes nothing.
CREATE TABLE IF NOT EXISTS cells (
    id TEXT PRIMARY KEY
);

-- Small key/value store; holds `last` = "<cell>,<unix_ts>" for line-fill.
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
