#!/usr/bin/env bash
set -euo pipefail

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
  "f1f64019dbc4c68ba0930fabcb09bcba00f5f1ac",
  "bfea42334de27584b70367a0375ed9972a6e14e1"
)

# Determine job count (cross-platform)
if command -v nproc >/dev/null 2>&1; then
  JOBS=$(nproc)
elif [[ "$OSTYPE" == "darwin"* ]]; then
  JOBS=$(sysctl -n hw.ncpu)
else
  JOBS=4
fi

ignore_pattern=$(IFS='|'; echo "${ignore_commits[*]}")
export ignore_pattern

process_file() {
  local fname="$1"
  local line
  line=$(git log --follow --no-patch --date=iso --pretty="format:%cs|%H;" -- "$fname" \
    | grep -Ev "$ignore_pattern" \
    | head -n 1)
  # No newline here
  printf '%s|%s' "$fname" "$line"
}

export -f process_file

# Collect outputs in parallel but without newlines
find content/wiki -name "*.md" -print0 |
  xargs -0 -P "$JOBS" -I{} bash -c 'process_file "$@"' _ {}
