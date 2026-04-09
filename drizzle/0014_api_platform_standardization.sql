DO $$
BEGIN
  CREATE TYPE "checkout_session_status" AS ENUM (
    'draft',
    'quoted',
    'finalizing',
    'finalized',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_expires_at_idx" ON "verification" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliates_user_id_idx" ON "affiliates" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD COLUMN IF NOT EXISTS "email" varchar(256);
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD COLUMN IF NOT EXISTS "payment_status" varchar(64);
--> statement-breakpoint
UPDATE "checkout_orders"
SET
  "email" = lower("shipping_address"->>'email'),
  "payment_status" = lower("payment"->>'status')
WHERE
  "email" IS NULL
  OR "payment_status" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_orders_email_idx" ON "checkout_orders" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_orders_payment_status_idx" ON "checkout_orders" USING btree ("payment_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_orders_email_payment_status_user_id_idx" ON "checkout_orders" USING btree ("email","payment_status","user_id");
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "normalized_email" varchar(256) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "session_key" varchar(128) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "status" "checkout_session_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "cart_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "selected_shipping_service_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "payment_method" varchar(32);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "payment_currency" varchar(16);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "source_wallet_address" text;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "discount_code" varchar(128);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "pricing_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "provider_quote_cache" jsonb;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "quote_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "finalized_order_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "finalized_access_key" varchar(128);
--> statement-breakpoint
UPDATE "checkout_drafts"
SET
  "normalized_email" = CASE
    WHEN coalesce("normalized_email", '') = '' THEN lower(coalesce("email", ''))
    ELSE "normalized_email"
  END,
  "session_key" = CASE
    WHEN coalesce("session_key", '') = '' THEN "id"
    ELSE "session_key"
  END,
  "expires_at" = coalesce("expires_at", now() + interval '7 days')
WHERE
  coalesce("normalized_email", '') = ''
  OR coalesce("session_key", '') = ''
  OR "expires_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_drafts_normalized_email_idx" ON "checkout_drafts" USING btree ("normalized_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_drafts_cart_id_idx" ON "checkout_drafts" USING btree ("cart_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_drafts_status_idx" ON "checkout_drafts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_drafts_expires_at_idx" ON "checkout_drafts" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_idempotency_keys" (
  "key" varchar(160) PRIMARY KEY NOT NULL,
  "scope" varchar(64) NOT NULL,
  "resource_id" varchar(128),
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_keys_scope_idx" ON "api_idempotency_keys" USING btree ("scope");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_keys_resource_id_idx" ON "api_idempotency_keys" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_keys_expires_at_idx" ON "api_idempotency_keys" USING btree ("expires_at");
