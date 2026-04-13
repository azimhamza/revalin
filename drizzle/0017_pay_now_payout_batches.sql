DO $$ BEGIN
 CREATE TYPE "public"."payout_batch_type" AS ENUM('weekly', 'pay_now');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD COLUMN IF NOT EXISTS "batch_type" "public"."payout_batch_type" DEFAULT 'weekly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "promoter_weekly_payouts" ADD COLUMN IF NOT EXISTS "batch_type" "public"."payout_batch_type" DEFAULT 'weekly' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "affiliate_weekly_payouts_period_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_weekly_payouts_period_idx"
  ON "affiliate_weekly_payouts" USING btree ("affiliate_id", "commission_month_key", "period_start", "period_end", "batch_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_weekly_payouts_open_pay_now_idx"
  ON "affiliate_weekly_payouts" USING btree ("affiliate_id", "commission_month_key")
  WHERE "batch_type" = 'pay_now' AND "status" IN ('pending', 'approved');
--> statement-breakpoint
DROP INDEX IF EXISTS "promoter_weekly_payouts_period_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_weekly_payouts_period_idx"
  ON "promoter_weekly_payouts" USING btree ("promoter_id", "commission_month_key", "period_start", "period_end", "batch_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promoter_weekly_payouts_open_pay_now_idx"
  ON "promoter_weekly_payouts" USING btree ("promoter_id", "commission_month_key")
  WHERE "batch_type" = 'pay_now' AND "status" IN ('pending', 'approved');
