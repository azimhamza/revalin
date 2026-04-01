CREATE INDEX "checkout_orders_cart_id_idx" ON "checkout_orders" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "checkout_orders_updated_at_idx" ON "checkout_orders" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "affiliates_discount_code_idx" ON "affiliates" USING btree ("discount_code");--> statement-breakpoint
