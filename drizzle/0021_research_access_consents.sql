CREATE TABLE IF NOT EXISTS "research_access_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "consent_token" varchar(128) NOT NULL,
  "terms_version" varchar(32) NOT NULL,
  "minimum_age" integer NOT NULL,
  "terms_accepted" boolean DEFAULT true NOT NULL,
  "research_use_accepted" boolean DEFAULT true NOT NULL,
  "institution_name" varchar(256),
  "institution_identifier" varchar(128),
  "research_use_description" text,
  "institution_name_provided" boolean DEFAULT false NOT NULL,
  "institution_identifier_provided" boolean DEFAULT false NOT NULL,
  "research_use_description_provided" boolean DEFAULT false NOT NULL,
  "email" varchar(256),
  "normalized_email" varchar(256),
  "user_id" text,
  "ip_address" text,
  "user_agent" text,
  "entry_path" varchar(512),
  "referrer" text,
  "metadata" jsonb,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_access_consent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "consent_id" uuid NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "source" varchar(64),
  "email" varchar(256),
  "normalized_email" varchar(256),
  "user_id" text,
  "checkout_order_id" varchar(64),
  "checkout_session_id" varchar(128),
  "ip_address" text,
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_access_consents" ADD CONSTRAINT "research_access_consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_access_consent_events" ADD CONSTRAINT "research_access_consent_events_consent_id_research_access_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."research_access_consents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_access_consent_events" ADD CONSTRAINT "research_access_consent_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_access_consent_events" ADD CONSTRAINT "research_access_consent_events_checkout_order_id_checkout_orders_order_id_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_access_consents_token_idx" ON "research_access_consents" USING btree ("consent_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consents_email_idx" ON "research_access_consents" USING btree ("normalized_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consents_user_id_idx" ON "research_access_consents" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consents_accepted_at_idx" ON "research_access_consents" USING btree ("accepted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_consent_id_idx" ON "research_access_consent_events" USING btree ("consent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_type_idx" ON "research_access_consent_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_email_idx" ON "research_access_consent_events" USING btree ("normalized_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_user_id_idx" ON "research_access_consent_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_order_id_idx" ON "research_access_consent_events" USING btree ("checkout_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_access_consent_events_created_at_idx" ON "research_access_consent_events" USING btree ("created_at");
