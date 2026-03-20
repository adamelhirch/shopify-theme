#!/usr/bin/env bash
set -euo pipefail

STORE="${SHOPIFY_STORE:-4bru0c-p4.myshopify.com}"
THEME_ID="${SHOPIFY_QA_THEME_ID:-181070168331}"

exec shopify theme push \
  --store "$STORE" \
  --theme "$THEME_ID" \
  --nodelete \
  "$@"
