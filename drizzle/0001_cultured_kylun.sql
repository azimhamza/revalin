CREATE TYPE "public"."affiliate_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"email" varchar(256) NOT NULL,
	"encrypted_wallet_address" text NOT NULL,
	"wallet_iv" varchar(64) NOT NULL,
	"wallet_tag" varchar(64) NOT NULL,
	"discount_code" varchar(128),
	"commission_rate" varchar(16) DEFAULT '0.05' NOT NULL,
	"status" "affiliate_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_code_idx" ON "affiliates" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_email_idx" ON "affiliates" USING btree ("email");