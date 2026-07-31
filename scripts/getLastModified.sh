#!/usr/bin/env bash
set -euo pipefail

# Refactor commits that must not count as content modifications.
ignore_commits=(
  "67f6075f51de7c62327fba114e9310774f94fb95"
  "03eb7d5aea2e4750b1db40aa363b36b409d802a6"
  "1c14119c3afb28a20f892926de83e7f7c9eb8141"
  "c02f425d27b9dd76f451f3fec0fbf45979fd1048"
  "0d2a48e2e108d3ebb1ee6c0d825097b55c997394"
  "5d77a63b0f1899235bbabd6a6629f3306efd6af4"
  "c5838bc8b91c59fd7fbe5743dea6d5052d7427e5"
  "fa0ae14cfdaf0c51f51f7bbef398ccd4496d23b7"
  "ccad2024da87cc5ad70a7d34e6425ac9f1062b93"
  "6aa96e1c68ceb62ed99efa0f4173b8f79f5dc6eb"
  "267bb26f822c361da2386c9325764a9c99e65316"
  "feb7d14386e877e8f6f0781bad8c001addcd9971"
  "d1cd416ec70a5d12930c338a49c9beb41d853734"
  "f1f64019dbc4c68ba0930fabcb09bcba00f5f1ac"
  "bfea42334de27584b70367a0375ed9972a6e14e1"
)

# git log prints paths relative to the repository root; find prints them
# relative to the current directory.
prefix=$(git rev-parse --show-prefix)

# One history pass. The markdown pathspec keeps rename detection away from
# image blobs, so this works in a partial clone that has no old images.
# A per-file `git log --follow` walk compares against the full tree and
# downloads gigabytes of old image blobs in such a clone.
git log --name-status --find-renames --format='@%cs|%H' -- ':(top)*.md' ':(top)*.mdx' ':(top)*.mdoc' |
	awk -v FS='\t' \
		-v prefix="$prefix" \
		-v ignores="${ignore_commits[*]}" \
		-v files="$(find content/wiki -name '*.md' | tr '\n' ' ')" '
BEGIN {
	n = split(ignores, a, " ")
	for (i = 1; i <= n; i++) ignore[a[i]] = 1
	m = split(files, f, " ")
	for (i = 1; i <= m; i++) active[prefix f[i]] = f[i]
}
/^@/ {
	split(substr($0, 2), c, "|")
	date = c[1]; hash = c[2]
	skip = (hash in ignore)
	next
}
NF < 2 { next }
{
	target = $NF
	if (!(target in active)) next
	orig = active[target]
	if (!skip) {
		done[orig] = date "|" hash
		delete active[target]
	} else if ($1 ~ /^R/) {
		# An ignored commit renamed the file: keep walking its old path.
		active[$2] = orig
		delete active[target]
	}
}
END {
	for (i = 1; i <= m; i++)
		if (f[i] in done) printf "%s|%s;", f[i], done[f[i]]
}'
