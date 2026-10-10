CREATE TABLE IF NOT EXISTS "password_reset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "app_user"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_user_idx" ON "password_reset" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_token_uq" ON "password_reset" ("token_hash");
