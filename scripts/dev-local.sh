#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared store and theme IDs live in the common helper so each developer can override only their own dev theme ID.
source "${SCRIPT_DIR}/shopify-common.sh"

cd "${ROOT_DIR}"
require_non_main_branch

exec shopify theme dev \
  --store "${SHOPIFY_STORE}" \
  --theme "${SHOPIFY_DEV_THEME_ID}" \
  --host 127.0.0.1 \
  --port 9292
