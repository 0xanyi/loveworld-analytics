#!/usr/bin/env bash
set -euo pipefail

# Idempotent: creates the dev database if it doesn't exist.
# Used by contributors on first setup.
#
# Identifiers can't be SQL-parameterised, so the primary defence against
# injection is a strict whitelist on DB_NAME before any SQL is built.

DB_NAME="${POSTGRES_DB:-lwa_dev}"
DB_USER="${POSTGRES_USER:-lwa}"

if ! [[ "$DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "✗ invalid database name: '$DB_NAME' (must match [a-zA-Z_][a-zA-Z0-9_]*)" >&2
  exit 1
fi

echo "→ Ensuring database '$DB_NAME' exists on container lwa-postgres..."

exists=$(
  docker exec lwa-postgres psql -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'"
)

if [ "$exists" != "1" ]; then
  docker exec lwa-postgres psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\""
fi

echo "✓ Database ready."
