CREATE TYPE "public"."wallet_status" AS ENUM('unused', 'active', 'used', 'swept');--> statement-breakpoint
CREATE TABLE "checkout_orders" (
	"order_id" varchar(64) PRIMARY KEY NOT NULL,
	"access_key" varchar(128) NOT NULL,
	"cart_id" varchar(128),
	"currency_code" varchar(8) NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_service" jsonb,
	"lines" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"payment" jsonb NOT NULL,
	"swell" jsonb NOT NULL,
	"shipengine" jsonb,
	"ipn_events" jsonb,
	"latest_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"address" varchar(128) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"encryption_iv" varchar(64) NOT NULL,
	"encryption_tag" varchar(64) NOT NULL,
	"status" "wallet_status" DEFAULT 'unused' NOT NULL,
	"shieldclimb_address_in" varchar(256),
	"shieldclimb_polygon_address_in" varchar(256),
	"shieldclimb_ipn_token" varchar(512),
	"value_coin_received" varchar(64),
	"txid_in" varchar(256),
	"txid_out" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_order_id_checkout_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE no action ON UPDATE no action;