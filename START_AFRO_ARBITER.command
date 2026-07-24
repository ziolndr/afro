#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"

print "AFRO — SEARCH AFRICA BY MEANING"
print "────────────────────────────────────────────────────────"

if [[ ! -f data/manifest.json || ! -f data/vectors.f32 || ! -f data/metadata.jsonl.gz ]]; then
  print "No complete field found. Pulling the full Afro Magazine archive and embedding it now..."
  print
  node scripts/build-field.mjs
  print
fi

print "Starting AFRO — SEARCH AFRICA BY MEANING at http://127.0.0.1:8796"
print
exec env AFRO_PORT=8796 node server.mjs
