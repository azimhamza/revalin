CREATE TYPE "public"."product_notification_dispatch_status" AS ENUM('pending', 'completed', 'partial_failure', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_notification_subscription_status" AS ENUM('pending', 'notified');--> statement-breakpoint
CREATE TABLE "product_notification_dispatch_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"product_handle" varchar(256) NOT NULL,
	"product_title" text NOT NULL,
	"variant_id" varchar(128),
	"variant_title" text,
	"variant_key" varchar(128) NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"notified_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_notification_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"swell_coupon_id" varchar(128) NOT NULL,
	"discount_code" varchar(128) NOT NULL,
	"discount_expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" text,
	"selected_target_count" integer DEFAULT 0 NOT NULL,
	"eligible_target_count" integer DEFAULT 0 NOT NULL,
	"skipped_target_count" integer DEFAULT 0 NOT NULL,
	"subscription_count" integer DEFAULT 0 NOT NULL,
	"notified_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" "product_notification_dispatch_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(256) NOT NULL,
	"normalized_email" varchar(256) NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"product_handle" varchar(256) NOT NULL,
	"product_title" text NOT NULL,
	"variant_id" varchar(128),
	"variant_title" text,
	"variant_key" varchar(128) NOT NULL,
	"status" "product_notification_subscription_status" DEFAULT 'pending' NOT NULL,
	"signup_email_sent_at" timestamp with time zone,
	"signup_email_error" text,
	"last_dispatch_id" uuid,
	"last_attempted_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_notification_dispatch_products" ADD CONSTRAINT "product_notification_dispatch_products_dispatch_id_product_notification_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."product_notification_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notification_dispatches" ADD CONSTRAINT "product_notification_dispatches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notification_subscriptions" ADD CONSTRAINT "product_notification_subscriptions_last_dispatch_id_product_notification_dispatches_id_fk" FOREIGN KEY ("last_dispatch_id") REFERENCES "public"."product_notification_dispatches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_notification_dispatch_products_dispatch_id_idx" ON "product_notification_dispatch_products" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "product_notification_dispatch_products_product_handle_idx" ON "product_notification_dispatch_products" USING btree ("product_handle");--> statement-breakpoint
CREATE INDEX "product_notification_dispatch_products_variant_key_idx" ON "product_notification_dispatch_products" USING btree ("variant_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_dispatch_products_dispatch_target_idx" ON "product_notification_dispatch_products" USING btree ("dispatch_id","product_handle","variant_key");--> statement-breakpoint
CREATE INDEX "product_notification_dispatches_status_idx" ON "product_notification_dispatches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_notification_dispatches_started_at_idx" ON "product_notification_dispatches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "product_notification_dispatches_created_by_user_id_idx" ON "product_notification_dispatches" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_subscriptions_pending_email_variant_idx" ON "product_notification_subscriptions" USING btree ("normalized_email","product_handle","variant_key") WHERE "product_notification_subscriptions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_status_idx" ON "product_notification_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_product_handle_idx" ON "product_notification_subscriptions" USING btree ("product_handle");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_variant_key_idx" ON "product_notification_subscriptions" USING btree ("variant_key");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_created_at_idx" ON "product_notification_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_last_dispatch_id_idx" ON "product_notification_subscriptions" USING btree ("last_dispatch_id");
