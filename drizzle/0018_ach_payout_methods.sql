DO $$ BEGIN
 CREATE TYPE "public"."payout_method" AS ENUM('crypto_usdc_polygon', 'ach_bank_transfer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ach_account_type" AS ENUM('checking', 'savings');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "payout_method" "public"."payout_method" DEFAULT 'crypto_usdc_polygon' NOT NULL;
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_account_holder_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_bank_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_account_type" "public"."ach_account_type";
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "encrypted_ach_routing_number" text;
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_routing_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_routing_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_routing_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "encrypted_ach_account_number" text;
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_account_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_account_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD COLUMN IF NOT EXISTS "ach_account_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "payout_method" "public"."payout_method" DEFAULT 'crypto_usdc_polygon' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_account_holder_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_bank_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_account_type" "public"."ach_account_type";
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "encrypted_ach_routing_number" text;
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_routing_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_routing_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_routing_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "encrypted_ach_account_number" text;
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_account_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_account_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "ach_account_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_method" "public"."payout_method" DEFAULT 'crypto_usdc_polygon' NOT NULL;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_holder_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_bank_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_type" "public"."ach_account_type";
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "encrypted_ach_routing_number" text;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "encrypted_ach_account_number" text;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_fee_rate" varchar(16) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_fee_amount" varchar(32) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "net_payout_amount" varchar(32) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(256);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_method" "public"."payout_method" DEFAULT 'crypto_usdc_polygon' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_holder_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_bank_name" varchar(256);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_type" "public"."ach_account_type";
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "encrypted_ach_routing_number" text;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_routing_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "encrypted_ach_account_number" text;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_iv" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_tag" varchar(64);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "ach_account_number_last4" varchar(4);
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_fee_rate" varchar(16) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "payout_fee_amount" varchar(32) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "net_payout_amount" varchar(32) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(256);
--> statement-breakpoint
UPDATE "affiliates"
SET "payout_method" = 'crypto_usdc_polygon'
WHERE "payout_method" IS NULL;
--> statement-breakpoint
UPDATE "promoters"
SET "payout_method" = 'crypto_usdc_polygon'
WHERE "payout_method" IS NULL;
--> statement-breakpoint
UPDATE "affiliate_weekly_payouts"
SET
  "payout_method" = COALESCE("payout_method", 'crypto_usdc_polygon'),
  "payout_fee_rate" = COALESCE(NULLIF("payout_fee_rate", ''), '0'),
  "payout_fee_amount" = COALESCE(NULLIF("payout_fee_amount", ''), '0.00'),
  "net_payout_amount" = COALESCE(NULLIF("net_payout_amount", ''), "total_normalized_commission_amount"),
  "payment_reference" = COALESCE(NULLIF("payment_reference", ''), "tx_hash")
WHERE
  "payout_method" IS NULL
  OR "payout_fee_rate" IS NULL
  OR "payout_fee_amount" IS NULL
  OR "net_payout_amount" IS NULL
  OR "payment_reference" IS NULL;
--> statement-breakpoint
UPDATE "promoter_weekly_payouts"
SET
  "payout_method" = COALESCE("payout_method", 'crypto_usdc_polygon'),
  "payout_fee_rate" = COALESCE(NULLIF("payout_fee_rate", ''), '0'),
  "payout_fee_amount" = COALESCE(NULLIF("payout_fee_amount", ''), '0.00'),
  "net_payout_amount" = COALESCE(NULLIF("net_payout_amount", ''), "total_normalized_commission_amount"),
  "payment_reference" = COALESCE(NULLIF("payment_reference", ''), "tx_hash")
WHERE
  "payout_method" IS NULL
  OR "payout_fee_rate" IS NULL
  OR "payout_fee_amount" IS NULL
  OR "net_payout_amount" IS NULL
  OR "payment_reference" IS NULL;
