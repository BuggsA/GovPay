#!/usr/bin/env bash
# Copy the shared data/engine into every site so each folder deploys on its own
# (each Cloudflare Pages project points at one sites/<name> directory).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for site in "$root"/sites/*/; do
  mkdir -p "$site/shared"
  mkdir -p "$site/shared/data"
  cp "$root"/shared/*.js "$site/shared/"
  cp "$root"/shared/data/*.js "$site/shared/data/"
  echo "synced -> ${site#$root/}shared/"
done
