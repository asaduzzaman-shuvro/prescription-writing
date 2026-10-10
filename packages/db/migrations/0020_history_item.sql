CREATE TABLE "history_item" (
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
ALTER TABLE "history_item" ADD CONSTRAINT "history_item_specialty_code_specialty_code_fk" FOREIGN KEY ("specialty_code") REFERENCES "public"."specialty"("code") ON DELETE no action ON UPDATE no action;
