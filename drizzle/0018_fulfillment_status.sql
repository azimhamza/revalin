DO $$ BEGIN
 CREATE TYPE "public"."fulfillment_status" AS ENUM('pending', 'label_ready', 'packed', 'handed_to_carrier', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "checkout_orders" ADD COLUMN IF NOT EXISTS "fulfillment_status" "public"."fulfillment_status" DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS "checkout_orders_fulfillment_status_idx" ON "checkout_orders" ("fulfillment_status");

-- Backfill: orders with successful labels → label_ready
UPDATE "checkout_orders"
SET "fulfillment_status" = 'label_ready'
WHERE "fulfillment_status" = 'pending'
  AND "shipengine" IS NOT NULL
  AND "shipengine"->>'labelUrl' IS NOT NULL
  AND "shipengine"->>'labelUrl' != '';

-- Backfill: orders that already had shipped emails sent → handed_to_carrier
UPDATE "checkout_orders"
SET "fulfillment_status" = 'handed_to_carrier'
WHERE "fulfillment_status" = 'label_ready'
  AND "payment"->>'__processing' IS NOT NULL
  AND ("payment"->'__processing'->'shippedEmail'->>'status') = 'completed';
