CREATE TYPE "public"."aware_group" AS ENUM('access', 'watch', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."interaction_severity" AS ENUM('minor', 'moderate', 'major', 'contraindicated');--> statement-breakpoint
CREATE TYPE "public"."medicine_system" AS ENUM('allopathic', 'herbal', 'ayurvedic', 'unani', 'homeopathic');--> statement-breakpoint
CREATE TYPE "public"."encounter_status" AS ENUM('waiting', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'data_editor');--> statement-breakpoint
CREATE TYPE "public"."prescription_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."tenant_kind" AS ENUM('solo', 'clinic');--> statement-breakpoint
CREATE TYPE "public"."tenant_role" AS ENUM('clinic_admin', 'doctor', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "advice_snippet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"text_bn" text NOT NULL,
	"text_en" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "brand_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_name" text NOT NULL,
	"form_id" uuid,
	"company_id" uuid,
	"strength_text" text,
	"dar_number" text,
	"medicine_system" "medicine_system" DEFAULT 'allopathic' NOT NULL,
	"generic_text" text DEFAULT '' NOT NULL,
	"discontinued_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "complaint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"name_bn" text
);
--> statement-breakpoint
CREATE TABLE "diagnosis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"icd10" text,
	"icd11" text
);
--> statement-breakpoint
CREATE TABLE "dosage_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"short_label" text,
	"default_route" text,
	"default_unit" text,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "drug_class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "generic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"synonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_antibiotic" boolean DEFAULT false NOT NULL,
	"aware_group" "aware_group",
	"pregnancy_category" text,
	"paed_max_mg_per_kg_day" numeric(10, 3),
	"adult_max_mg_per_day" numeric(10, 3),
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "generic_drug_class" (
	"generic_id" uuid NOT NULL,
	"drug_class_id" uuid NOT NULL,
	CONSTRAINT "generic_drug_class_generic_id_drug_class_id_pk" PRIMARY KEY("generic_id","drug_class_id")
);
--> statement-breakpoint
CREATE TABLE "generic_interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generic_a" uuid NOT NULL,
	"generic_b" uuid NOT NULL,
	"severity" "interaction_severity" NOT NULL,
	"effect" text NOT NULL,
	"management" text,
	"reviewed_by" text,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "generic_interaction_order" CHECK ("generic_interaction"."generic_a" < "generic_interaction"."generic_b")
);
--> statement-breakpoint
CREATE TABLE "generic_monograph" (
	"generic_id" uuid PRIMARY KEY NOT NULL,
	"indications" text,
	"dosage" text,
	"administration" text,
	"contraindications" text,
	"side_effects" text,
	"interactions" text,
	"pregnancy_lactation" text,
	"precautions" text,
	"paediatric_use" text,
	"format" text DEFAULT 'text' NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruction_snippet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"text_bn" text NOT NULL,
	"text_en" text
);
--> statement-breakpoint
CREATE TABLE "investigation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "product_ingredient" (
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"generic_id" uuid NOT NULL,
	"strength_value" numeric(14, 4),
	"strength_unit" text,
	"basis" text,
	CONSTRAINT "product_ingredient_product_id_position_pk" PRIMARY KEY("product_id","position")
);
--> statement-breakpoint
CREATE TABLE "product_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"pack_size" text,
	"mrp" numeric(12, 2),
	"price_date" date,
	"price_source" text NOT NULL,
	"govt_fixed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialty" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_bn" text
);
--> statement-breakpoint
CREATE TABLE "specialty_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"specialty_code" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"schema" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"platform_role" "platform_role",
	"disabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"tenant_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "chamber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"doctor_user_id" uuid,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"hours" text,
	"print_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_favorite" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"default_shortcut" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_bn" text,
	"degrees_en" text[] DEFAULT '{}'::text[] NOT NULL,
	"degrees_bn" text[] DEFAULT '{}'::text[] NOT NULL,
	"designation" text,
	"institution" text,
	"specialty_code" text DEFAULT 'general' NOT NULL,
	"specialty_label" text,
	"bmdc_number" text NOT NULL,
	"bmdc_expiry" date,
	"bmdc_verified_at" timestamp with time zone,
	"bmdc_verified_by" uuid,
	"signature_data_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_user_id" uuid NOT NULL,
	"chamber_id" uuid,
	"visit_date" date NOT NULL,
	"serial_no" integer,
	"status" "encounter_status" DEFAULT 'waiting' NOT NULL,
	"specialty_code" text DEFAULT 'general' NOT NULL,
	"template_id" uuid,
	"vitals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exam_findings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fee" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'previewed' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "tenant_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"dob" date,
	"dob_estimated" boolean DEFAULT false NOT NULL,
	"sex" "sex",
	"mobile" text,
	"address" text,
	"nid" text,
	"brn" text,
	"health_id" text,
	"allergies" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"consent_at" timestamp with time zone,
	"guardian_name" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_user_id" uuid NOT NULL,
	"chamber_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"status" "prescription_status" DEFAULT 'draft' NOT NULL,
	"doc" jsonb NOT NULL,
	"finalized_at" timestamp with time zone,
	"verify_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prescription_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid,
	"brand_name" text NOT NULL,
	"generic_name" text,
	"instruction" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rx_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"owner_user_id" uuid,
	"specialty_code" text,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "tenant_kind" DEFAULT 'solo' NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"patient_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advice_snippet" ADD CONSTRAINT "advice_snippet_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_product" ADD CONSTRAINT "brand_product_form_id_dosage_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."dosage_form"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_product" ADD CONSTRAINT "brand_product_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_drug_class" ADD CONSTRAINT "generic_drug_class_generic_id_generic_id_fk" FOREIGN KEY ("generic_id") REFERENCES "public"."generic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_drug_class" ADD CONSTRAINT "generic_drug_class_drug_class_id_drug_class_id_fk" FOREIGN KEY ("drug_class_id") REFERENCES "public"."drug_class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_interaction" ADD CONSTRAINT "generic_interaction_generic_a_generic_id_fk" FOREIGN KEY ("generic_a") REFERENCES "public"."generic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_interaction" ADD CONSTRAINT "generic_interaction_generic_b_generic_id_fk" FOREIGN KEY ("generic_b") REFERENCES "public"."generic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_monograph" ADD CONSTRAINT "generic_monograph_generic_id_generic_id_fk" FOREIGN KEY ("generic_id") REFERENCES "public"."generic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_snippet" ADD CONSTRAINT "instruction_snippet_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation" ADD CONSTRAINT "investigation_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ingredient" ADD CONSTRAINT "product_ingredient_product_id_brand_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."brand_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ingredient" ADD CONSTRAINT "product_ingredient_generic_id_generic_id_fk" FOREIGN KEY ("generic_id") REFERENCES "public"."generic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pack" ADD CONSTRAINT "product_pack_product_id_brand_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."brand_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialty_template" ADD CONSTRAINT "specialty_template_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamber" ADD CONSTRAINT "chamber_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamber" ADD CONSTRAINT "chamber_doctor_user_id_app_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_favorite" ADD CONSTRAINT "doctor_favorite_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_favorite" ADD CONSTRAINT "doctor_favorite_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_favorite" ADD CONSTRAINT "doctor_favorite_product_id_brand_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."brand_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_bmdc_verified_by_app_user_id_fk" FOREIGN KEY ("bmdc_verified_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_doctor_user_id_app_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_chamber_id_chamber_id_fk" FOREIGN KEY ("chamber_id") REFERENCES "public"."chamber"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_template_id_specialty_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."specialty_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_encounter_id_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_doctor_user_id_app_user_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_chamber_id_chamber_id_fk" FOREIGN KEY ("chamber_id") REFERENCES "public"."chamber"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_product_id_brand_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."brand_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rx_template" ADD CONSTRAINT "rx_template_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rx_template" ADD CONSTRAINT "rx_template_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rx_template" ADD CONSTRAINT "rx_template_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_product_dar_uq" ON "brand_product" USING btree ("dar_number");--> statement-breakpoint
CREATE INDEX "brand_product_brand_trgm" ON "brand_product" USING gin (lower("brand_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "brand_product_generic_trgm" ON "brand_product" USING gin (lower("generic_text") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "brand_product_brand_prefix" ON "brand_product" USING btree (lower("brand_name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "brand_product_company_idx" ON "brand_product" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_name_uq" ON "company" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "dosage_form_name_uq" ON "dosage_form" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "drug_class_name_uq" ON "drug_class" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "generic_name_uq" ON "generic" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "generic_name_trgm" ON "generic" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "generic_interaction_pair_uq" ON "generic_interaction" USING btree ("generic_a","generic_b");--> statement-breakpoint
CREATE INDEX "product_ingredient_generic_idx" ON "product_ingredient" USING btree ("generic_id");--> statement-breakpoint
CREATE INDEX "product_pack_product_idx" ON "product_pack" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specialty_template_uq" ON "specialty_template" USING btree ("specialty_code","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_uq" ON "app_user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "chamber_tenant_idx" ON "chamber" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_favorite_uq" ON "doctor_favorite" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_profile_bmdc_uq" ON "doctor_profile" USING btree (upper("bmdc_number"));--> statement-breakpoint
CREATE INDEX "encounter_tenant_date_idx" ON "encounter" USING btree ("tenant_id","visit_date");--> statement-breakpoint
CREATE INDEX "encounter_patient_idx" ON "encounter" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_uq" ON "membership" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "patient_tenant_mobile_idx" ON "patient" USING btree ("tenant_id","mobile");--> statement-breakpoint
CREATE INDEX "patient_tenant_name_trgm" ON "patient" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "patient_tenant_code_uq" ON "patient" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "prescription_patient_idx" ON "prescription" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "prescription_tenant_created_idx" ON "prescription" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_verify_uq" ON "prescription" USING btree ("verify_token");--> statement-breakpoint
CREATE INDEX "prescription_item_rx_idx" ON "prescription_item" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescription_item_product_idx" ON "prescription_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "rx_template_tenant_idx" ON "rx_template" USING btree ("tenant_id");