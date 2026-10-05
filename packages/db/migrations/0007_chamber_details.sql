ALTER TABLE "chamber" ADD COLUMN "schedule" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "chamber" ADD COLUMN "serial_phone" text;--> statement-breakpoint
ALTER TABLE "chamber" ADD COLUMN "footer_text" text;--> statement-breakpoint
ALTER TABLE "chamber" ADD COLUMN "logo_data_url" text;