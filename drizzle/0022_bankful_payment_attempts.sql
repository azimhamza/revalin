CREATE TABLE IF NOT EXISTS "bankful_payment_attempts" (
	"attempt_id" varchar(96) PRIMARY KEY NOT NULL,
	"checkout_session_id" varchar(128) NOT NULL,
	"checkout_session_version" integer NOT NULL,
	"cart_id" varchar(128),
	"order_id" varchar(64),
	"email" varchar(256),
	"status" varchar(64) NOT NULL,
	"amount" varchar(32) NOT NULL,
	"currency_code" varchar(8) NOT NULL,
	"customer" jsonb NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_service" jsonb,
	"lines" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"swell" jsonb,
	"bankful" jsonb,
	"latest_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bankful_payment_attempts_order_id_checkout_orders_order_id_fk"
		FOREIGN KEY ("order_id") REFERENCES "checkout_orders"("order_id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bankful_payment_attempts_session_version_idx" ON "bankful_payment_attempts" USING btree ("checkout_session_id","checkout_session_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bankful_payment_attempts_order_id_idx" ON "bankful_payment_attempts" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bankful_payment_attempts_email_idx" ON "bankful_payment_attempts" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bankful_payment_attempts_status_idx" ON "bankful_payment_attempts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bankful_payment_attempts_updated_at_idx" ON "bankful_payment_attempts" USING btree ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_orders_payment_provider_idx" ON "checkout_orders" USING btree ((payment->>'provider'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_orders_bankful_record_id_idx" ON "checkout_orders" USING btree ((payment->>'transactionRecordId')) WHERE payment->>'provider' = 'bankful';
