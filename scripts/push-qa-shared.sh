#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/shopify-common.sh"

cd "${ROOT_DIR}"
require_non_main_branch
require_clean_worktree

CURRENT_BRANCH="$(git branch --show-current)"

echo "Pushing git branch '${CURRENT_BRANCH}' to origin..."
git push -u origin "${CURRENT_BRANCH}"

echo "Pushing current theme code to QA Shared (${SHOPIFY_QA_THEME_ID}) on ${SHOPIFY_STORE}..."
shopify theme push \
  --store "${SHOPIFY_STORE}" \
  --theme "${SHOPIFY_QA_THEME_ID}" \
  --nodelete

echo "QA Shared is updated. Live theme ${SHOPIFY_LIVE_THEME_ID} was not touched."
