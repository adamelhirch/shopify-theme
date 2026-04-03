#!/usr/bin/env bash
set -euo pipefail

STORE="${SHOPIFY_STORE:-4bru0c-p4.myshopify.com}"
THEME_ID="${SHOPIFY_QA_THEME_ID:-}"

if [[ -z "$THEME_ID" ]]; then
  echo "Error: SHOPIFY_QA_THEME_ID must be set explicitly." >&2
  echo "Example: SHOPIFY_QA_THEME_ID=181126234379 ./bin/theme-push-qa.sh" >&2
  exit 1
fi

exec shopify theme push \
  --store "$STORE" \
  --theme "$THEME_ID" \
  --nodelete \
  "$@"
