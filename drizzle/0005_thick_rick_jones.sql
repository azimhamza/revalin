ALTER TABLE "user" ADD COLUMN "research_use_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "research_use_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "research_use_terms_version" varchar(32);