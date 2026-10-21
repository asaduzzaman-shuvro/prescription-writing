-- Run once on cPanel Postgres (phpPgAdmin / psql) before using Sakura Web credentials.
-- Database: sakuraph_prescription

ALTER TABLE "doctor_profile" ADD COLUMN IF NOT EXISTS "sakura_phone" text;
ALTER TABLE "doctor_profile" ADD COLUMN IF NOT EXISTS "sakura_password" text;
