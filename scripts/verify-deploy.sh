#!/usr/bin/env bash
#
# Check that bookofadam.org serves the build in dist/ (`yarn verify:deploy`; run at the end of
# `yarn deploy`). SITE overrides the target, e.g. a local preview server.
#
# A 200 proves nothing — the SPA fallback answers 200 with index.html for every path. So wait
# for the edge to serve THIS build's index.html byte for byte, then check the content-hashed
# bundle it names, which the fallback cannot fake.
set -euo pipefail

SITE="${SITE:-https://bookofadam.org}"
# CloudFront caches the empty bucket's 403 (and later, the old index.html) for a few seconds.
VERIFY_TIMEOUT_S="${VERIFY_TIMEOUT_S:-180}"
VERIFY_INTERVAL_S=5

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX="$ROOT/dist/index.html"
[ -f "$INDEX" ] || { echo "no build at $INDEX to compare against" >&2; exit 1; }

echo "==> verifying $SITE serves the build in dist/"
bundle=$(grep -o -m1 '/assets/index-[A-Za-z0-9_-]*\.js' "$INDEX")
expected=$(cat "$INDEX")
deadline=$((SECONDS + VERIFY_TIMEOUT_S))
until served=$(curl -sf "$SITE/") && [ "$served" = "$expected" ]; do
  if ((SECONDS > deadline)); then
    echo "FAIL $SITE/ is not this build's index.html after ${VERIFY_TIMEOUT_S}s" >&2
    exit 1
  fi
  sleep "$VERIFY_INTERVAL_S"
done
echo "ok   index.html is this build's"

failures=0
expect_header() { # url, header regex, description
  if curl -sI "$1" | grep -qiE "$2"; then
    echo "ok   $3"
  else
    echo "FAIL $3 ($1)" >&2
    failures=$((failures + 1))
  fi
}
expect_header "$SITE$bundle" '^HTTP/[0-9.]+ 200' "bundle $bundle is served"
expect_header "$SITE$bundle" '^content-type: (application|text)/javascript' "bundle is JavaScript"
expect_header "$SITE$bundle" '^cache-control: .*immutable' "bundle is cached immutable"
expect_header "$SITE/api/texts/registry.json" '^content-type: application/json' "data API is JSON"
expect_header "$SITE/api/texts/registry.json" '^cache-control: no-cache' "data API is no-cache"
((failures == 0)) || { echo "verification failed ($failures)" >&2; exit 1; }
echo "==> verified: $SITE serves this build"
