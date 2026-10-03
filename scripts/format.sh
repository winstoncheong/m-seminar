#!/usr/bin/env bash
# Format the web assets and data with Prettier.
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes prettier --write \
  "index.html" \
  "assets/*.js" \
  "assets/*.css" \
  "data/*.json" \
  "README.md"
