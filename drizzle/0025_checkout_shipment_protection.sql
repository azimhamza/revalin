ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "shipment_protection" boolean DEFAULT false NOT NULL;
