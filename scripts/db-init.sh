#!/usr/bin/env bash
set -euo pipefail

# Idempotent: creates the dev database if it doesn't exist.
# Used by contributors on first setup.

DB_NAME="${POSTGRES_DB:-lwa_dev}"
DB_USER="${POSTGRES_USER:-lwa}"

echo "→ Ensuring database '$DB_NAME' exists on container lwa-postgres..."
docker exec lwa-postgres psql -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  || docker exec lwa-postgres psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"
echo "✓ Database ready."
