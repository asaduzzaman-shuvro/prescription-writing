CREATE TYPE "public"."doctor_complaint_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "doctor_complaint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"replaces_complaint_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"status" "doctor_complaint_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_complaint_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctor_complaint" ADD CONSTRAINT "doctor_complaint_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_complaint" ADD CONSTRAINT "doctor_complaint_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_complaint" ADD CONSTRAINT "doctor_complaint_replaces_complaint_id_complaint_id_fk" FOREIGN KEY ("replaces_complaint_id") REFERENCES "public"."complaint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_complaint" ADD CONSTRAINT "doctor_complaint_approved_complaint_id_complaint_id_fk" FOREIGN KEY ("approved_complaint_id") REFERENCES "public"."complaint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doctor_complaint_owner_idx" ON "doctor_complaint" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "doctor_complaint_status_idx" ON "doctor_complaint" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_complaint_override_uq" ON "doctor_complaint" USING btree ("owner_user_id","replaces_complaint_id") WHERE replaces_complaint_id IS NOT NULL;