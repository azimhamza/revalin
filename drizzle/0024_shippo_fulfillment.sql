CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD COLUMN IF NOT EXISTS "fulfillment" jsonb;
--> statement-breakpoint
UPDATE "checkout_orders"
SET "fulfillment" = jsonb_build_object('provider', 'shipengine') || "shipengine"
WHERE "fulfillment" IS NULL
  AND "shipengine" IS NOT NULL
  AND jsonb_typeof("shipengine") = 'object';
