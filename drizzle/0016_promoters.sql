DO $$
BEGIN
  CREATE TYPE "promoter_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "promoter_invite_status" AS ENUM (
    'invited',
    'applied',
    'successful',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD COLUMN IF NOT EXISTS "promoter" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(256) NOT NULL,
  "email" varchar(256) NOT NULL,
  "user_id" text,
  "encrypted_wallet_address" text NOT NULL,
  "wallet_iv" varchar(64) NOT NULL,
  "wallet_tag" varchar(64) NOT NULL,
  "default_commission_rate" varchar(16) DEFAULT '0.025' NOT NULL,
  "status" "promoter_status" DEFAULT 'approved' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promoters" ADD COLUMN IF NOT EXISTS "code" varchar(64);
--> statement-breakpoint
UPDATE "promoters"
SET "code" = 'promoter-' || substr(replace("id"::text, '-', ''), 1, 10)
WHERE "code" IS NULL OR "code" = '';
--> statement-breakpoint
ALTER TABLE "promoters" ALTER COLUMN "code" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoters" ADD CONSTRAINT "promoters_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoters_code_idx" ON "promoters" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoters_email_idx" ON "promoters" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoters_user_id_idx" ON "promoters" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoters_status_idx" ON "promoters" USING btree ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "promoter_id" uuid NOT NULL,
  "invited_affiliate_id" uuid,
  "invited_name" varchar(256),
  "invited_email" varchar(256) NOT NULL,
  "normalized_invited_email" varchar(256) NOT NULL,
  "social_profiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "referral_code" varchar(64),
  "commission_rate" varchar(16),
  "status" "promoter_invite_status" DEFAULT 'invited' NOT NULL,
  "invite_email_sent_at" timestamp with time zone,
  "invite_email_error" text,
  "applied_at" timestamp with time zone,
  "successful_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_by_user_id" text,
  "successful_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promoter_invites" ADD COLUMN IF NOT EXISTS "referral_code" varchar(64);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_invites" ADD CONSTRAINT "promoter_invites_promoter_id_promoters_id_fk"
    FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_invites" ADD CONSTRAINT "promoter_invites_invited_affiliate_id_affiliates_id_fk"
    FOREIGN KEY ("invited_affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_invites" ADD CONSTRAINT "promoter_invites_created_by_user_id_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_invites" ADD CONSTRAINT "promoter_invites_successful_by_user_id_user_id_fk"
    FOREIGN KEY ("successful_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_invites_promoter_id_idx" ON "promoter_invites" USING btree ("promoter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_invites_status_idx" ON "promoter_invites" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_invites_invited_email_idx" ON "promoter_invites" USING btree ("normalized_invited_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_invites_invited_affiliate_id_idx" ON "promoter_invites" USING btree ("invited_affiliate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_invites_referral_code_idx" ON "promoter_invites" USING btree ("referral_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_invites_active_affiliate_idx"
  ON "promoter_invites" USING btree ("invited_affiliate_id")
  WHERE "status" IN ('invited', 'applied', 'successful') AND "invited_affiliate_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_invites_successful_affiliate_idx"
  ON "promoter_invites" USING btree ("invited_affiliate_id")
  WHERE "status" = 'successful' AND "invited_affiliate_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter_weekly_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "promoter_id" uuid NOT NULL,
  "commission_month_key" varchar(7) NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "period_timezone" varchar(64) DEFAULT 'America/Toronto' NOT NULL,
  "earning_count" integer DEFAULT 0 NOT NULL,
  "total_normalized_commission_amount" varchar(32) DEFAULT '0.00' NOT NULL,
  "payout_currency_code" varchar(8) DEFAULT 'USD' NOT NULL,
  "encrypted_wallet_address" text,
  "wallet_iv" varchar(64),
  "wallet_tag" varchar(64),
  "tx_hash" varchar(128),
  "admin_notes" text,
  "status" "payout_status" DEFAULT 'pending' NOT NULL,
  "approved_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_weekly_payouts" ADD CONSTRAINT "promoter_weekly_payouts_promoter_id_promoters_id_fk"
    FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_weekly_payouts_period_idx"
  ON "promoter_weekly_payouts" USING btree ("promoter_id","commission_month_key","period_start","period_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_weekly_payouts_promoter_id_idx" ON "promoter_weekly_payouts" USING btree ("promoter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_weekly_payouts_status_idx" ON "promoter_weekly_payouts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_weekly_payouts_period_start_idx" ON "promoter_weekly_payouts" USING btree ("period_start");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promoter_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar(64) NOT NULL,
  "promoter_id" uuid NOT NULL,
  "promoter_invite_id" uuid NOT NULL,
  "affiliate_id" uuid NOT NULL,
  "affiliate_code" varchar(64) NOT NULL,
  "order_total" varchar(32) NOT NULL,
  "commission_month_key" varchar(7),
  "commission_rate" varchar(16) NOT NULL,
  "commission_amount" varchar(32) NOT NULL,
  "normalized_order_total" varchar(32),
  "normalized_commission_amount" varchar(32),
  "payout_currency_code" varchar(8) DEFAULT 'USD' NOT NULL,
  "currency_code" varchar(8) NOT NULL,
  "payment_provider" varchar(32) NOT NULL,
  "earned_at" timestamp with time zone,
  "payout_period_start" timestamp with time zone,
  "payout_period_end" timestamp with time zone,
  "payout_period_timezone" varchar(64) DEFAULT 'America/Toronto' NOT NULL,
  "weekly_payout_id" uuid,
  "earned_email_sent_at" timestamp with time zone,
  "status" "payout_status" DEFAULT 'pending' NOT NULL,
  "tx_hash" varchar(128),
  "admin_notes" text,
  "approved_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_payouts" ADD CONSTRAINT "promoter_payouts_order_id_checkout_orders_order_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_payouts" ADD CONSTRAINT "promoter_payouts_promoter_id_promoters_id_fk"
    FOREIGN KEY ("promoter_id") REFERENCES "public"."promoters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_payouts" ADD CONSTRAINT "promoter_payouts_promoter_invite_id_promoter_invites_id_fk"
    FOREIGN KEY ("promoter_invite_id") REFERENCES "public"."promoter_invites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_payouts" ADD CONSTRAINT "promoter_payouts_affiliate_id_affiliates_id_fk"
    FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promoter_payouts" ADD CONSTRAINT "promoter_payouts_weekly_payout_id_promoter_weekly_payouts_id_fk"
    FOREIGN KEY ("weekly_payout_id") REFERENCES "public"."promoter_weekly_payouts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_payouts_order_id_unique_idx" ON "promoter_payouts" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_promoter_id_idx" ON "promoter_payouts" USING btree ("promoter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_invite_id_idx" ON "promoter_payouts" USING btree ("promoter_invite_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_affiliate_id_idx" ON "promoter_payouts" USING btree ("affiliate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_status_idx" ON "promoter_payouts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_month_key_idx" ON "promoter_payouts" USING btree ("commission_month_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_weekly_payout_id_idx" ON "promoter_payouts" USING btree ("weekly_payout_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promoter_payouts_period_start_idx" ON "promoter_payouts" USING btree ("payout_period_start");
