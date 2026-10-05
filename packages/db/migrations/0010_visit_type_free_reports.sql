CREATE TYPE "public"."visit_type" AS ENUM('new', 'followup', 'report');--> statement-breakpoint
ALTER TABLE "chamber" ADD COLUMN "free_report_days" integer;--> statement-breakpoint
ALTER TABLE "encounter" ADD COLUMN "visit_type" "visit_type";