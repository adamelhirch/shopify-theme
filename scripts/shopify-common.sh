#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SHOPIFY_STORE="${SHOPIFY_STORE:-4bru0c-p4.myshopify.com}"
SHOPIFY_LIVE_THEME_ID="${SHOPIFY_LIVE_THEME_ID:-180888928523}"
SHOPIFY_QA_THEME_ID="${SHOPIFY_QA_THEME_ID:-181070168331}"
SHOPIFY_DEV_THEME_ID="${SHOPIFY_DEV_THEME_ID:-181069611275}"
SHOPIFY_DEV_THEME_NAME="${SHOPIFY_DEV_THEME_NAME:-Development (3e3a23-Adams-MacBook-Air)}"

require_non_main_branch() {
  local branch
  branch="$(git branch --show-current)"

  if [[ -z "${branch}" ]]; then
    echo "Unable to determine the current git branch." >&2
    exit 1
  fi

  if [[ "${branch}" == "main" ]]; then
    echo "Refusing to run on 'main'. Create or checkout a feature branch first." >&2
    exit 1
  fi
}

require_clean_worktree() {
  if [[ -n "$(git status --short)" ]]; then
    echo "The git worktree is dirty. Stop and review unrelated changes before pushing." >&2
    git status --short >&2
    exit 1
  fi
}
