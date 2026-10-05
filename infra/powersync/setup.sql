-- One-time (idempotent) PowerSync setup on the app database server. Run as a superuser:
--   psql postgres://rx:rx@localhost:5433/rx -f infra/powersync/setup.sql
-- CREATE DATABASE cannot run inside the migration transaction, so it lives here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'powersync_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_storage_user') THEN
    CREATE ROLE powersync_storage_user LOGIN PASSWORD 'storage_dev';
  END IF;
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
SELECT 'CREATE DATABASE powersync_storage OWNER powersync_storage_user'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'powersync_storage')\gexec
