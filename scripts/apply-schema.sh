#!/usr/bin/env bash
# Applies supabase/schema.sql to your database without opening the SQL editor.
#
#   bash scripts/apply-schema.sh "postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres"
#
# Get that connection string from Supabase: Project settings → Database →
# Connection string → URI. Safe to run as many times as you like.
set -euo pipefail

URL="${1:-${DATABASE_URL:-}}"
if [ -z "$URL" ]; then
  echo "No database URL given."
  echo "Usage: bash scripts/apply-schema.sh \"postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres\""
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$HERE/supabase/schema.sql"
[ -f "$FILE" ] || { echo "Can't find supabase/schema.sql"; exit 1; }

if ! command -v psql >/dev/null 2>&1; then
  echo "Installing the postgres client…"
  (sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client) >/dev/null 2>&1 \
    || { echo "Could not install psql. Ask the Codespace assistant to install postgresql-client."; exit 1; }
fi

echo "Applying $(wc -l < "$FILE") lines to your database…"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$FILE"
echo "Done. The database is up to date."
