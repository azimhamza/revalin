CREATE TYPE "public"."interac_email_event_status" AS ENUM('received', 'matched_paid', 'matched_partial', 'review_required', 'ignored', 'parser_failed');--> statement-breakpoint
CREATE TYPE "public"."interac_review_status" AS ENUM('open', 'resolved', 'ignored', 'refunded');--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN "interac_sender_email" varchar(256);--> statement-breakpoint
ALTER TABLE "checkout_drafts" ADD COLUMN "interac_sender_name" varchar(256);--> statement-breakpoint
CREATE TABLE "gmail_watch_state" (
	"mailbox" varchar(256) PRIMARY KEY NOT NULL,
	"topic_name" text NOT NULL,
	"last_history_id" varchar(128),
	"expiration" timestamp with time zone,
	"last_renewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interac_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_message_id" varchar(128) NOT NULL,
	"pubsub_message_id" varchar(128),
	"history_id" varchar(128),
	"status" "interac_email_event_status" DEFAULT 'received' NOT NULL,
	"matched_order_id" varchar(64),
	"review_reason" varchar(64),
	"parser_error" text,
	"subject" text,
	"from_address" text,
	"to_address" text,
	"reply_to_address" text,
	"authentication_results" text,
	"authenticity" jsonb,
	"parsed" jsonb,
	"raw_text" text,
	"raw_html" text,
	"received_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interac_email_events_gmail_message_unique_idx" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "interac_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(64),
	"event_id" uuid,
	"status" "interac_review_status" DEFAULT 'open' NOT NULL,
	"reason" varchar(64) NOT NULL,
	"expected_amount" varchar(32),
	"received_amount" varchar(32),
	"message_code" varchar(64),
	"sender_name" text,
	"sender_email" text,
	"bank_reference" varchar(128),
	"screenshot_urls" jsonb,
	"admin_notes" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interac_email_events" ADD CONSTRAINT "interac_email_events_matched_order_id_checkout_orders_order_id_fk" FOREIGN KEY ("matched_order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interac_review_items" ADD CONSTRAINT "interac_review_items_order_id_checkout_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interac_review_items" ADD CONSTRAINT "interac_review_items_event_id_interac_email_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."interac_email_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interac_review_items" ADD CONSTRAINT "interac_review_items_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gmail_watch_state_updated_at_idx" ON "gmail_watch_state" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "interac_email_events_status_idx" ON "interac_email_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "interac_email_events_matched_order_idx" ON "interac_email_events" USING btree ("matched_order_id");--> statement-breakpoint
CREATE INDEX "interac_email_events_created_at_idx" ON "interac_email_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "interac_review_items_status_idx" ON "interac_review_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "interac_review_items_order_idx" ON "interac_review_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "interac_review_items_reason_idx" ON "interac_review_items" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "interac_review_items_created_at_idx" ON "interac_review_items" USING btree ("created_at");
