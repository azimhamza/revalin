DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "affiliate_payouts"
		GROUP BY "order_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot add affiliate_payouts_order_id_unique_idx because duplicate affiliate_payouts.order_id rows already exist.';
	END IF;
END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "affiliate_payouts_order_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_payouts_order_id_unique_idx" ON "affiliate_payouts" USING btree ("order_id");
