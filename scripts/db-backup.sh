#!/usr/bin/env bash
# Manual Supabase backup — free tier has no automated backups.
# Usage:
#   DATABASE_URL="postgresql://postgres.<ref>:<db_password>@<host>.pooler.supabase.com:5432/postgres" \
#     ./scripts/db-backup.sh
# Get the connection string: Supabase Dashboard → Connect → Connection string (Pooler) → Transaction
set -euo pipefail
DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "error: DATABASE_URL not set (see header comment)" >&2
  exit 1
fi
mkdir -p backups
ts=$(date +%Y%m%d-%H%M%S)
out="backups/supabase-$ts.dump"
pg_dump "$DATABASE_URL" --no-owner --no-privileges --format=custom -f "$out"
echo "backup written: $out  ($(du -h "$out" | cut -f1))"
echo "restore:  pg_restore --no-owner -d <target_db_url> $out"
