#!/usr/bin/env bash
#
# Build the public site and publish it to bookofadam.org (S3 + CloudFront; docs/deploy.md).
#
#   yarn deploy             build, check, upload, invalidate, verify (scripts/verify-deploy.sh)
#   yarn deploy --dry-run   build, check, and show what would change — read-only on AWS
#
# Runs as the `neko` AWS profile unless AWS_PROFILE is already set; that profile's
# BookOfAdamDeploy policy allows exactly what this needs (list, put, delete, invalidate).
#
# Cache headers follow the nekoagent.org two-pass model, with the split drawn by directory:
# Vite content-hashes everything under assets/, so those are cached forever; every other file
# keeps its name across deploys (index.html, the whole static data API under api/, the Deseret
# dictionaries) and must be `no-cache`, or a reader is pinned to a stale copy. Drawing the line
# at assets/ rather than listing stable names means a new data file cannot be missed.
set -euo pipefail

BUCKET="book-of-adam-site"
SITE="https://bookofadam.org"
export AWS_PROFILE="${AWS_PROFILE:-neko}"

IMMUTABLE_CACHE="public,max-age=31536000,immutable"
MUTABLE_CACHE="no-cache"
# Wildcards cost one invalidation path each; the first 1,000 paths a month are free.
# The search index (/pagefind/*) is one wildcard: its file names are content hashes, so a
# re-index deletes thousands of files, and listing each would pass CloudFront's 3,000-path cap.
SEARCH_INDEX_PREFIX="/pagefind/"
MUTABLE_INVALIDATIONS=(/index.html "/api/*" "/deseret/*" "${SEARCH_INDEX_PREFIX}*")

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

# Account-specific AWS identifiers stay out of the public repo: deploy/aws/ is gitignored,
# and its site.env sets DISTRIBUTION (docs/deploy.md, "Layout").
AWS_LOCAL="$ROOT/deploy/aws/site.env"
[ -f "$AWS_LOCAL" ] || { echo "missing $AWS_LOCAL (gitignored, kept per machine; see docs/deploy.md)" >&2; exit 1; }
# shellcheck source=/dev/null
source "$AWS_LOCAL"
: "${DISTRIBUTION:?DISTRIBUTION not set in $AWS_LOCAL}"

DRY_RUN=false
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=true ;;
  *) echo "usage: $0 [--dry-run]" >&2; exit 2 ;;
esac
dryrun_flag=()
$DRY_RUN && dryrun_flag=(--dryrun)

cd "$ROOT"

echo "==> building the public site"
yarn build:public

# A deploy that uploads a stale or research build is worse than one that fails.
[ -f "$DIST/index.html" ] || { echo "no build output at $DIST" >&2; exit 1; }
echo "==> checking it is safe to publish"
yarn check:public

# Every deletion must be invalidated too: a removed hashed asset was served immutable for a
# year, so the edge keeps answering for it long after S3 has forgotten it.
# The sync logs are echoed with `tee >(cat >&2)`, not `tee /dev/stderr`: reopening
# /dev/stderr truncates it when stderr is a file, so `yarn deploy > deploy.log 2>&1` lost
# every line before the last pass.
deleted=()
collect_deletions() {
  local line
  while IFS= read -r line; do
    local key="/${line#delete: s3://$BUCKET/}"
    # Already covered by the index's wildcard in MUTABLE_INVALIDATIONS.
    [[ "$key" == "$SEARCH_INDEX_PREFIX"* ]] && continue
    [ -n "$line" ] && deleted+=("$key")
  done < <(grep -o "delete: s3://$BUCKET/[^[:space:]]*" <<<"$1" || true)
}

echo "==> pass 1: hashed assets (immutable), uploads only"
aws s3 sync "$DIST/" "s3://$BUCKET/" "${dryrun_flag[@]}" \
  --exclude "*" --include "assets/*" \
  --cache-control "$IMMUTABLE_CACHE"

echo "==> pass 2: everything else (no-cache), with deletions"
log=$(aws s3 sync "$DIST/" "s3://$BUCKET/" "${dryrun_flag[@]}" --delete \
  --exclude "assets/*" \
  --cache-control "$MUTABLE_CACHE" | tee >(cat >&2))
collect_deletions "$log"

# Last, so the new index.html is live before the assets the old one referenced disappear.
echo "==> pass 3: delete hashed assets no longer referenced"
# Same cache header as pass 1, so a re-upload here (pass 1 failed partway) is still right.
log=$(aws s3 sync "$DIST/" "s3://$BUCKET/" "${dryrun_flag[@]}" --delete \
  --exclude "*" --include "assets/*" \
  --cache-control "$IMMUTABLE_CACHE" | tee >(cat >&2))
collect_deletions "$log"

if $DRY_RUN; then
  echo "==> dry run: would invalidate ${MUTABLE_INVALIDATIONS[*]} plus ${#deleted[@]} deleted path(s)"
  echo "==> dry run complete — nothing was uploaded"
  exit 0
fi

echo "==> invalidating ${#MUTABLE_INVALIDATIONS[@]} mutable path(s) + ${#deleted[@]} deleted"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" \
  --paths "${MUTABLE_INVALIDATIONS[@]}" "${deleted[@]}" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

"$ROOT/scripts/verify-deploy.sh"

echo "==> deployed and verified: $SITE"
