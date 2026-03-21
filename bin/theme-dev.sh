#!/usr/bin/env bash
set -euo pipefail

STORE="${SHOPIFY_STORE:-4bru0c-p4.myshopify.com}"
HOST="${SHOPIFY_DEV_HOST:-127.0.0.1}"
PORT="${SHOPIFY_DEV_PORT:-9292}"

exec shopify theme dev \
  --store "$STORE" \
  --host "$HOST" \
  --port "$PORT" \
  --nodelete \
  "$@"
