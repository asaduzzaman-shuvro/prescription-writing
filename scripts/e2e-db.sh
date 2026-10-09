#!/usr/bin/env bash
# Sets up the e2e database, so Playwright never writes into the dev database. Idempotent; re-run it after adding
# migrations or changing the dev seed. Run as a Postgres superuser (like infra/powersync/setup.sql), after README
# "Run locally" (roles, wal_level=logical, data/dev-seed). Then: cd apps/web && pnpm build && pnpm e2e
#   prescription_service_e2e  app data, migrated and dev-seeded (localhost only, like the dev DB)
#   powersync_storage_e2e     storage for the powersync-e2e service (infra/docker-compose.yml, profile e2e, :8081)
# Runs accumulate test patients there; drop both databases and re-run this to start clean.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=prescription_service_e2e
STORAGE=powersync_storage_e2e
exists() { [ "$(psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$1'")" = 1 ]; }

exists "$DB" || createdb -O prescription_service "$DB"
exists "$STORAGE" || createdb -O powersync_storage_user "$STORAGE"
# Before the migrations: its default privileges give powersync_role SELECT on the tables they create.
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f infra/powersync/setup.sql

export DATABASE_URL="postgres://prescription_service:prescription_service@localhost:5432/$DB"
pnpm db:migrate
pnpm db:seed:dev

# After the migrations: PowerSync needs the "powersync" publication they create.
docker compose -f infra/docker-compose.yml --profile e2e up -d --wait powersync-e2e
echo "e2e database ready: $DB, PowerSync on http://localhost:8081"
