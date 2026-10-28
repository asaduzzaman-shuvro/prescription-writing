CREATE TYPE "public"."custom_medicine_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "custom_medicine" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"brand_name" text NOT NULL,
	"form_id" uuid,
	"strength_text" text,
	"generic_text" text,
	"generic_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"company_id" uuid,
	"company_name" text,
	"status" "custom_medicine_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_medicine" ADD CONSTRAINT "custom_medicine_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_medicine" ADD CONSTRAINT "custom_medicine_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_medicine" ADD CONSTRAINT "custom_medicine_form_id_dosage_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."dosage_form"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_medicine" ADD CONSTRAINT "custom_medicine_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_medicine" ADD CONSTRAINT "custom_medicine_approved_product_id_brand_product_id_fk" FOREIGN KEY ("approved_product_id") REFERENCES "public"."brand_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_medicine_owner_idx" ON "custom_medicine" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "custom_medicine_status_idx" ON "custom_medicine" USING btree ("status","created_at");