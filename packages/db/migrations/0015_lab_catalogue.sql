CREATE TABLE "lab_panel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"key" text NOT NULL,
	"name" text,
	"department" text,
	"sort_order" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'clinic' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_panel_platform_complete" CHECK ("lab_panel"."tenant_id" is not null or "lab_panel"."name" is not null)
);
--> statement-breakpoint
CREATE TABLE "lab_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lab_name" text,
	"address" text,
	"phone" text,
	"logo_data_url" text,
	"signatories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footer_text" text,
	"print_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_profile_tenantId_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "lab_test" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"code" text NOT NULL,
	"name" text,
	"short" text,
	"unit" text,
	"kind" text,
	"department" text,
	"sort_order" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'clinic' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_test_platform_complete" CHECK ("lab_test"."tenant_id" is not null or ("lab_test"."name" is not null and "lab_test"."short" is not null and "lab_test"."kind" is not null))
);
--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "source" text DEFAULT 'external' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "lab_no" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "specimen" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "prepared_by_name" text;--> statement-breakpoint
ALTER TABLE "lab_report" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "lab_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_panel" ADD CONSTRAINT "lab_panel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_profile" ADD CONSTRAINT "lab_profile_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_test" ADD CONSTRAINT "lab_test_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_panel_platform_key_uq" ON "lab_panel" USING btree ("key") WHERE "lab_panel"."tenant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_panel_tenant_key_uq" ON "lab_panel" USING btree ("tenant_id","key") WHERE "lab_panel"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_test_platform_code_uq" ON "lab_test" USING btree ("code") WHERE "lab_test"."tenant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_test_tenant_code_uq" ON "lab_test" USING btree ("tenant_id","code") WHERE "lab_test"."tenant_id" is not null;--> statement-breakpoint
CREATE INDEX "lab_report_request_idx" ON "lab_report" USING btree ("request_id");