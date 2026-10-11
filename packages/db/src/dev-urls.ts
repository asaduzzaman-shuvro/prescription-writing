/**
 * Local dev database: `prescription_service`, owned by the `prescription_service` user (CREATEROLE, for rx_app), on
 * the developer's own Postgres, which needs wal_level=logical for PowerSync.
 * DB_HOST (plus DB_USER, DB_PASSWORD, DB_NAME) overrides these, then DATABASE_URL / DATABASE_URL_APP.
 */
export const DEV_DATABASE_URL = "postgres://prescription_service:prescription_service@localhost:5432/prescription_service";
export const DEV_DATABASE_URL_APP = "postgres://rx_app:rx_app@localhost:5432/prescription_service";
