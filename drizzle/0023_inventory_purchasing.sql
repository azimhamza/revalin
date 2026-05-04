CREATE TYPE "public"."inventory_item_type" AS ENUM('sellable_product', 'packaging', 'label', 'sticker', 'card', 'insert', 'supply', 'other');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('initial_stock', 'purchase_received', 'manual_adjustment', 'fulfillment_consumed');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."purchase_payment_status" AS ENUM('unpaid', 'partially_paid', 'paid', 'refunded', 'void');--> statement-breakpoint
CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"code" varchar(64) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"code" varchar(64) NOT NULL,
	"contact_name" varchar(256),
	"email" varchar(256),
	"phone" varchar(64),
	"website" text,
	"payment_terms" varchar(128),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"default_vendor_id" uuid,
	"name" varchar(256) NOT NULL,
	"code" varchar(96) NOT NULL,
	"sku" varchar(128),
	"barcode" varchar(128),
	"item_type" "inventory_item_type" DEFAULT 'supply' NOT NULL,
	"unit" varchar(32) DEFAULT 'unit' NOT NULL,
	"location" varchar(256),
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"swell_product_id" varchar(128),
	"swell_variant_id" varchar(128),
	"product_handle" varchar(256),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_consumption_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"consumed_item_id" uuid NOT NULL,
	"applies_to_item_id" uuid,
	"applies_to_swell_product_id" varchar(128),
	"applies_to_swell_variant_id" varchar(128),
	"applies_to_product_handle" varchar(256),
	"quantity_per_order" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" varchar(96) NOT NULL,
	"vendor_id" uuid,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"payment_status" "purchase_payment_status" DEFAULT 'unpaid' NOT NULL,
	"currency_code" varchar(8) DEFAULT 'USD' NOT NULL,
	"total_amount" varchar(32) DEFAULT '0.00' NOT NULL,
	"amount_paid" varchar(32) DEFAULT '0.00' NOT NULL,
	"payment_method" varchar(64),
	"payment_reference" varchar(256),
	"proof_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_at" timestamp with time zone,
	"ordered_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost" varchar(32) DEFAULT '0.00' NOT NULL,
	"line_total" varchar(32) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"receipt_number" varchar(96) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_user_id" text,
	"proof_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_received" integer NOT NULL,
	"unit_cost" varchar(32) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"unit_cost" varchar(32),
	"purchase_order_id" uuid,
	"purchase_receipt_id" uuid,
	"purchase_receipt_line_id" uuid,
	"checkout_order_id" varchar(64),
	"checkout_order_number" varchar(96),
	"source_type" varchar(64),
	"source_id" varchar(128),
	"idempotency_key" varchar(180),
	"created_by_user_id" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_default_vendor_id_inventory_vendors_id_fk" FOREIGN KEY ("default_vendor_id") REFERENCES "public"."inventory_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_rules" ADD CONSTRAINT "inventory_consumption_rules_consumed_item_id_inventory_items_id_fk" FOREIGN KEY ("consumed_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_rules" ADD CONSTRAINT "inventory_consumption_rules_applies_to_item_id_inventory_items_id_fk" FOREIGN KEY ("applies_to_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_inventory_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."inventory_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_user_id_user_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchase_receipt_line_id_purchase_receipt_lines_id_fk" FOREIGN KEY ("purchase_receipt_line_id") REFERENCES "public"."purchase_receipt_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_checkout_order_id_checkout_orders_order_id_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_categories_code_idx" ON "inventory_categories" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inventory_categories_active_idx" ON "inventory_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "inventory_categories_sort_order_idx" ON "inventory_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_vendors_code_idx" ON "inventory_vendors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inventory_vendors_name_idx" ON "inventory_vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "inventory_vendors_active_idx" ON "inventory_vendors" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_code_idx" ON "inventory_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "inventory_items_category_id_idx" ON "inventory_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "inventory_items_vendor_id_idx" ON "inventory_items" USING btree ("default_vendor_id");--> statement-breakpoint
CREATE INDEX "inventory_items_type_idx" ON "inventory_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "inventory_items_sku_idx" ON "inventory_items" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "inventory_items_barcode_idx" ON "inventory_items" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "inventory_items_swell_product_idx" ON "inventory_items" USING btree ("swell_product_id");--> statement-breakpoint
CREATE INDEX "inventory_items_swell_variant_idx" ON "inventory_items" USING btree ("swell_variant_id");--> statement-breakpoint
CREATE INDEX "inventory_items_product_handle_idx" ON "inventory_items" USING btree ("product_handle");--> statement-breakpoint
CREATE INDEX "inventory_items_active_idx" ON "inventory_items" USING btree ("active");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_consumed_item_idx" ON "inventory_consumption_rules" USING btree ("consumed_item_id");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_applies_item_idx" ON "inventory_consumption_rules" USING btree ("applies_to_item_id");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_swell_product_idx" ON "inventory_consumption_rules" USING btree ("applies_to_swell_product_id");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_swell_variant_idx" ON "inventory_consumption_rules" USING btree ("applies_to_swell_variant_id");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_handle_idx" ON "inventory_consumption_rules" USING btree ("applies_to_product_handle");--> statement-breakpoint
CREATE INDEX "inventory_consumption_rules_active_idx" ON "inventory_consumption_rules" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_po_number_idx" ON "purchase_orders" USING btree ("po_number");--> statement-breakpoint
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_payment_status_idx" ON "purchase_orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "purchase_orders_updated_at_idx" ON "purchase_orders" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_order_id_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_item_id_idx" ON "purchase_order_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_receipt_number_idx" ON "purchase_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "purchase_receipts_order_id_idx" ON "purchase_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_received_at_idx" ON "purchase_receipts" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_receipt_id_idx" ON "purchase_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_order_line_idx" ON "purchase_receipt_lines" USING btree ("purchase_order_line_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_item_id_idx" ON "purchase_receipt_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_idx" ON "inventory_movements" USING btree ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inventory_movements_item_id_idx" ON "inventory_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE INDEX "inventory_movements_purchase_order_idx" ON "inventory_movements" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_purchase_receipt_idx" ON "inventory_movements" USING btree ("purchase_receipt_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_checkout_order_idx" ON "inventory_movements" USING btree ("checkout_order_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements" USING btree ("created_at");
