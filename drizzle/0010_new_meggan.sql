CREATE TABLE "affiliate_commission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"month_key" varchar(7) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"old_rate" varchar(16),
	"new_rate" varchar(16),
	"revenue_snapshot" jsonb,
	"actor_user_id" text,
	"notes" text,
	"batch_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_commission_months" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"month_key" varchar(7) NOT NULL,
	"starting_rate" varchar(16) NOT NULL,
	"carried_forward_from_month_key" varchar(7),
	"recognized_revenue" varchar(32) DEFAULT '0.00' NOT NULL,
	"recognized_order_count" integer DEFAULT 0 NOT NULL,
	"tier_key" varchar(32) NOT NULL,
	"tier_label" varchar(64) NOT NULL,
	"effective_rate" varchar(16) NOT NULL,
	"override_rate" varchar(16),
	"override_reason" text,
	"override_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_discount_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"affiliate_code" varchar(64) NOT NULL,
	"swell_coupon_id" varchar(128),
	"discount_code" varchar(128),
	"old_discount_percent" varchar(16),
	"new_discount_percent" varchar(16),
	"reason" text,
	"changed_by_user_id" text,
	"change_scope" varchar(32) DEFAULT 'single' NOT NULL,
	"batch_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliates" ALTER COLUMN "commission_rate" SET DEFAULT '0.10';--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "commission_month_key" varchar(7);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "commission_tier_key" varchar(32);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "commission_tier_label" varchar(64);--> statement-breakpoint
UPDATE "affiliates"
SET "commission_rate" = '0.10'
WHERE "commission_rate" IS NULL OR "commission_rate" = '0.05';--> statement-breakpoint
UPDATE "affiliate_payouts"
SET "commission_month_key" = to_char(timezone('UTC', "created_at"), 'YYYY-MM')
WHERE "commission_month_key" IS NULL;--> statement-breakpoint
UPDATE "affiliate_payouts"
SET
  "commission_tier_key" = CASE
    WHEN "commission_rate"::numeric >= 0.40 THEN 'partner_equity'
    WHEN "commission_rate"::numeric >= 0.35 THEN 'authority'
    WHEN "commission_rate"::numeric >= 0.30 THEN 'apex'
    WHEN "commission_rate"::numeric >= 0.25 THEN 'partner'
    WHEN "commission_rate"::numeric >= 0.20 THEN 'scaler'
    WHEN "commission_rate"::numeric >= 0.15 THEN 'builder'
    WHEN "commission_rate"::numeric >= 0.10 THEN 'operator'
    ELSE 'legacy'
  END,
  "commission_tier_label" = CASE
    WHEN "commission_rate"::numeric >= 0.40 THEN 'Partner + Equity'
    WHEN "commission_rate"::numeric >= 0.35 THEN 'Authority'
    WHEN "commission_rate"::numeric >= 0.30 THEN 'Apex'
    WHEN "commission_rate"::numeric >= 0.25 THEN 'Partner'
    WHEN "commission_rate"::numeric >= 0.20 THEN 'Scaler'
    WHEN "commission_rate"::numeric >= 0.15 THEN 'Builder'
    WHEN "commission_rate"::numeric >= 0.10 THEN 'Operator'
    ELSE 'Legacy'
  END
WHERE "commission_tier_key" IS NULL OR "commission_tier_label" IS NULL;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_months" ADD CONSTRAINT "affiliate_commission_months_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_months" ADD CONSTRAINT "affiliate_commission_months_override_by_user_id_user_id_fk" FOREIGN KEY ("override_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_discount_changes" ADD CONSTRAINT "affiliate_discount_changes_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_discount_changes" ADD CONSTRAINT "affiliate_discount_changes_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_affiliate_id_idx" ON "affiliate_commission_events" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_month_key_idx" ON "affiliate_commission_events" USING btree ("month_key");--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_created_at_idx" ON "affiliate_commission_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_months_affiliate_month_idx" ON "affiliate_commission_months" USING btree ("affiliate_id","month_key");--> statement-breakpoint
CREATE INDEX "affiliate_commission_months_month_key_idx" ON "affiliate_commission_months" USING btree ("month_key");--> statement-breakpoint
CREATE INDEX "affiliate_commission_months_effective_rate_idx" ON "affiliate_commission_months" USING btree ("effective_rate");--> statement-breakpoint
CREATE INDEX "affiliate_discount_changes_affiliate_id_idx" ON "affiliate_discount_changes" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_discount_changes_created_at_idx" ON "affiliate_discount_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "affiliate_discount_changes_batch_id_idx" ON "affiliate_discount_changes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_month_key_idx" ON "affiliate_payouts" USING btree ("commission_month_key");
