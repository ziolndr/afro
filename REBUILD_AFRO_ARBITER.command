#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"

print "AFRO — COMPLETE CONTENT REFRESH"
print "────────────────────────────────────────────────────────"
node scripts/build-field.mjs --force
print
print "Refresh complete. Start with:"
print "  ./START_AFRO_ARBITER.command"
