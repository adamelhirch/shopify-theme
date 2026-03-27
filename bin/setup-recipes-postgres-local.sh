#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
PG_DATA="/opt/homebrew/var/postgresql@16"
DB_NAME="${VD_RECIPES_DB_NAME:-vd_recipes}"
DATABASE_URL="${VD_RECIPES_DATABASE_URL:-postgres:///$DB_NAME}"

echo "Installing PostgreSQL dependencies..."
HOMEBREW_NO_AUTO_UPDATE=1 brew install libpq postgresql@16

echo "Installing pg Ruby gem for Ruby 2.6..."
gem install --user-install pg -v 1.5.9 -- --with-pg-config=/opt/homebrew/opt/libpq/bin/pg_config

echo "Starting PostgreSQL..."
"$PG_BIN/pg_ctl" -D "$PG_DATA" -l /tmp/vd-postgresql.log start || true

echo "Ensuring database $DB_NAME exists..."
if ! "$PG_BIN/psql" -lqt | awk '{print $1}' | grep -qx "$DB_NAME"; then
  "$PG_BIN/createdb" "$DB_NAME"
fi

echo "Importing recipes into $DATABASE_URL..."
VD_RECIPES_DATABASE_URL="$DATABASE_URL" ruby "$ROOT_DIR/bin/import-recipes-to-postgres.rb"

cat <<EOF
PostgreSQL local bootstrap complete.

To run the recipes service on PostgreSQL:
  VD_RECIPES_STORE=postgres \\
  VD_RECIPES_DATABASE_URL=$DATABASE_URL \\
  ruby apps/recipes-service/server.rb
EOF
