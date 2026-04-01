CREATE TABLE "affiliate_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"affiliate_code" varchar(64) NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"referral_path" varchar(512),
	"referrer" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_visits" ADD CONSTRAINT "affiliate_visits_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_visits_affiliate_id_idx" ON "affiliate_visits" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_visits_affiliate_code_idx" ON "affiliate_visits" USING btree ("affiliate_code");--> statement-breakpoint
CREATE INDEX "affiliate_visits_visitor_id_idx" ON "affiliate_visits" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "affiliate_visits_created_at_idx" ON "affiliate_visits" USING btree ("created_at");--> statement-breakpoint
