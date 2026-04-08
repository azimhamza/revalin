CREATE TABLE "affiliate_commission_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(32) NOT NULL,
	"label" varchar(64) NOT NULL,
	"min_revenue" varchar(32) NOT NULL,
	"max_revenue" varchar(32),
	"rate" varchar(16) NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "affiliate_commission_tiers" ("key", "label", "min_revenue", "max_revenue", "rate", "sort_order", "active")
VALUES
	('operator', 'Operator', '0.00', '9999.99', '0.10', 0, true),
	('builder', 'Builder', '10000.00', '29999.99', '0.15', 1, true),
	('scaler', 'Scaler', '30000.00', '49999.99', '0.20', 2, true),
	('partner', 'Partner', '50000.00', '74999.99', '0.25', 3, true),
	('apex', 'Apex', '75000.00', '99999.99', '0.30', 4, true),
	('authority', 'Authority', '100000.00', '499999.99', '0.35', 5, true),
	('partner_equity', 'Partner + Equity', '500000.00', NULL, '0.40', 6, true);
--> statement-breakpoint
CREATE TABLE "affiliate_weekly_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"affiliate_code" varchar(64) NOT NULL,
	"commission_month_key" varchar(7) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"period_timezone" varchar(64) DEFAULT 'America/Toronto' NOT NULL,
	"earning_count" integer DEFAULT 0 NOT NULL,
	"total_normalized_commission_amount" varchar(32) DEFAULT '0.00' NOT NULL,
	"payout_currency_code" varchar(8) DEFAULT 'USD' NOT NULL,
	"current_tier_key" varchar(32),
	"current_tier_label" varchar(64),
	"next_tier_key" varchar(32),
	"next_tier_label" varchar(64),
	"amount_to_next_tier" varchar(32),
	"effective_rate" varchar(16),
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
ALTER TABLE "affiliate_payouts" ADD COLUMN "normalized_order_total" varchar(32);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "normalized_commission_amount" varchar(32);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "payout_currency_code" varchar(8) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "earned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "payout_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "payout_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "payout_period_timezone" varchar(64) DEFAULT 'America/Toronto' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "weekly_payout_id" uuid;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "earned_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliate_weekly_payouts" ADD CONSTRAINT "affiliate_weekly_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_tiers_key_idx" ON "affiliate_commission_tiers" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_tiers_sort_order_idx" ON "affiliate_commission_tiers" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "affiliate_commission_tiers_active_idx" ON "affiliate_commission_tiers" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_weekly_payouts_period_idx" ON "affiliate_weekly_payouts" USING btree ("affiliate_id","commission_month_key","period_start","period_end");--> statement-breakpoint
CREATE INDEX "affiliate_weekly_payouts_affiliate_id_idx" ON "affiliate_weekly_payouts" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_weekly_payouts_status_idx" ON "affiliate_weekly_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_weekly_payouts_period_start_idx" ON "affiliate_weekly_payouts" USING btree ("period_start");--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_weekly_payout_id_affiliate_weekly_payouts_id_fk" FOREIGN KEY ("weekly_payout_id") REFERENCES "public"."affiliate_weekly_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_payouts_weekly_payout_id_idx" ON "affiliate_payouts" USING btree ("weekly_payout_id");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_period_start_idx" ON "affiliate_payouts" USING btree ("payout_period_start");
