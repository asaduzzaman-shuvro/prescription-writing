ALTER TABLE "app_user" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "verified_by_name" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "verified_at" timestamp with time zone;
