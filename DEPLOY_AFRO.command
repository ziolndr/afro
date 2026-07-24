#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"

DOMAIN="${AFRO_DOMAIN:-afro.actualgeneralintelligence.com}"

print "AFRO — COMP-ACCURATE PRODUCTION DEPLOY"
print "────────────────────────────────────────────────────────"

for file in data/manifest.json data/vectors.f32 data/norms.f32 data/metadata.jsonl.gz; do
  if [[ ! -f "$file" ]]; then
    print "Missing $file"
    print "Build the complete Afro field first with ./REBUILD_AFRO_ARBITER.command"
    exit 1
  fi
done

node tests/unit.mjs

if command -v vercel >/dev/null 2>&1; then
  VERCEL=(vercel)
elif command -v npx >/dev/null 2>&1; then
  VERCEL=(npx --yes vercel@latest)
elif command -v npm >/dev/null 2>&1; then
  VERCEL=(npm exec --yes vercel@latest --)
else
  print "Neither vercel, npx, nor npm is available."
  exit 1
fi

print
print "Deploying the live field and comp-accurate interface to Vercel..."
DEPLOY_OUTPUT="$("${VERCEL[@]}" deploy --prod --yes 2>&1 | tee /dev/tty)"
DEPLOYMENT="$(print -r -- "$DEPLOY_OUTPUT" | grep -Eo 'https://[^[:space:]]+\.vercel\.app' | tail -n 1)"

if [[ -z "$DEPLOYMENT" ]]; then
  print "Vercel did not return a production URL."
  exit 1
fi

print
print "Attaching $DOMAIN..."
"${VERCEL[@]}" alias set "$DEPLOYMENT" "$DOMAIN"

print
print "DEPLOYED"
print "  https://$DOMAIN"
print "  $DEPLOYMENT"
