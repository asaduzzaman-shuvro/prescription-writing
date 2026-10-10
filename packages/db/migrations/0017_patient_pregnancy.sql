ALTER TABLE "patient" ADD COLUMN "pregnancy_status" text;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_pregnancy_status_check" CHECK (
  "pregnancy_status" IS NULL OR "pregnancy_status" IN ('none', 'pregnant', 'lactating', 'both')
);
