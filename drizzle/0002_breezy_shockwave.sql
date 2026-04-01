CREATE TABLE "checkout_drafts" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(256) NOT NULL,
	"cart_snapshot" jsonb NOT NULL,
	"shipping_address" jsonb,
	"totals_estimate" jsonb,
	"payment_completed" timestamp with time zone,
	"abandonment_event_sent" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checkout_drafts_email_idx" ON "checkout_drafts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "checkout_drafts_updated_at_idx" ON "checkout_drafts" USING btree ("updated_at");