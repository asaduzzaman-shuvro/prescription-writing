CREATE TYPE "public"."appointment_status" AS ENUM('booked', 'checked_in', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chamber_id" uuid,
	"doctor_user_id" uuid NOT NULL,
	"patient_id" uuid,
	"name" text NOT NULL,
	"mobile" text,
	"appt_date" date NOT NULL,
	"serial_no" integer NOT NULL,
	"status" "appointment_status" DEFAULT 'booked' NOT NULL,
	"encounter_id" uuid,
	"note" text,
	"source" text DEFAULT 'chamber' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prescription_id" uuid,
	"to_number" text NOT NULL,
	"body" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"provider_ref" text,
	"error" text,
	"segments" integer DEFAULT 1 NOT NULL,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"months" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tran_id" text NOT NULL,
	"gateway_ref" text,
	"gateway_payload" jsonb,
	"paid_at" timestamp with time zone,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "plan_expires_at" date;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "sms_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "display_token" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_chamber_id_chamber_id_fk" FOREIGN KEY ("chamber_id") REFERENCES "public"."chamber"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctor_user_id_app_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payment" ADD CONSTRAINT "subscription_payment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_tenant_date_idx" ON "appointment" USING btree ("tenant_id","appt_date");--> statement-breakpoint
CREATE INDEX "sms_log_tenant_idx" ON "sms_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payment_tran_uq" ON "subscription_payment" USING btree ("tran_id");--> statement-breakpoint
CREATE INDEX "subscription_payment_tenant_idx" ON "subscription_payment" USING btree ("tenant_id");