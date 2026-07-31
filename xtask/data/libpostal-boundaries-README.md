# libpostal OSM boundary tables (vendored)

`libpostal-boundaries.json` — per-country mapping of OSM `admin_level` to place type
("which admin_level is a municipality in this country"), the table `update-regions`
consults to break the 7-vs-8 municipality tie.

- Source: https://github.com/openvenues/libpostal — `resources/boundaries/osm/*.yaml`,
  compiled into one JSON (`{ iso: { admin_level: place_type } }`; the per-relation
  override sections are dropped, only the plain level tables are kept).
- Commit: 25099c506612b34b23b1bfe286ca6321fcf06f35
- License: MIT (© openvenues/libpostal contributors)

Refresh by re-downloading the YAMLs at a newer commit and recompiling the JSON.
