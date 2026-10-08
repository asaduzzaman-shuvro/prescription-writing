CREATE TABLE "lab_report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"encounter_id" uuid,
	"report_date" date NOT NULL,
	"lab_name" text,
	"panel" text NOT NULL,
	"title" text NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conclusion" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_report" ADD CONSTRAINT "lab_report_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_report" ADD CONSTRAINT "lab_report_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_report" ADD CONSTRAINT "lab_report_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_report_patient_idx" ON "lab_report" USING btree ("patient_id","report_date");--> statement-breakpoint
CREATE INDEX "lab_report_encounter_idx" ON "lab_report" USING btree ("encounter_id");