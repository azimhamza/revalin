import {
  pgTable,
  varchar,
  text,
  jsonb,
  timestamp,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AffiliateSocialProfile } from "../checkout/affiliate-social-profiles";

export type ResearchPaperAuthor = {
  name: string;
  affiliation?: string;
  orcid?: string;
};

export const walletStatusEnum = pgEnum("wallet_status", [
  "unused",
  "active",
  "used",
  "swept",
]);

export const affiliateStatusEnum = pgEnum("affiliate_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "approved",
  "paid",
  "rejected",
]);

export const productNotificationSubscriptionStatusEnum = pgEnum(
  "product_notification_subscription_status",
  ["pending", "notified"],
);

export const productNotificationDispatchStatusEnum = pgEnum(
  "product_notification_dispatch_status",
  ["pending", "completed", "partial_failure", "failed"],
);

export const researchPaperStatusEnum = pgEnum("research_paper_status", [
  "draft",
  "published",
  "archived",
]);

// ── better-auth tables ──

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").default("customer"),
  shippingAddress: text("shipping_address"),
  researchUseAccepted: boolean("research_use_accepted")
    .notNull()
    .default(false),
  researchUseAcceptedAt: timestamp("research_use_accepted_at", {
    withTimezone: true,
  }),
  researchUseTermsVersion: varchar("research_use_terms_version", {
    length: 32,
  }),
  preferredPaymentCurrency: varchar("preferred_payment_currency", {
    length: 32,
  }),
  cryptoWalletAddress: text("crypto_wallet_address"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ── Existing app tables ──

export const checkoutOrders = pgTable(
  "checkout_orders",
  {
    orderId: varchar("order_id", { length: 64 }).primaryKey(),
    accessKey: varchar("access_key", { length: 128 }).notNull(),
    cartId: varchar("cart_id", { length: 128 }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    currencyCode: varchar("currency_code", { length: 8 }).notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    shippingService: jsonb("shipping_service"),
    lines: jsonb("lines").notNull(),
    totals: jsonb("totals").notNull(),
    payment: jsonb("payment").notNull(),
    swell: jsonb("swell").notNull(),
    shipengine: jsonb("shipengine"),
    affiliate: jsonb("affiliate"),
    ipnEvents: jsonb("ipn_events"),
    latestError: text("latest_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("checkout_orders_cart_id_idx").on(table.cartId),
    index("checkout_orders_updated_at_idx").on(table.updatedAt),
  ],
);

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: varchar("order_id", { length: 64 })
    .notNull()
    .unique()
    .references(() => checkoutOrders.orderId),
  address: varchar("address", { length: 128 }).notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  encryptionIv: varchar("encryption_iv", { length: 64 }).notNull(),
  encryptionTag: varchar("encryption_tag", { length: 64 }).notNull(),
  status: walletStatusEnum("status").default("unused").notNull(),
  shieldclimbAddressIn: varchar("shieldclimb_address_in", { length: 256 }),
  shieldclimbPolygonAddressIn: varchar("shieldclimb_polygon_address_in", {
    length: 256,
  }),
  shieldclimbIpnToken: varchar("shieldclimb_ipn_token", { length: 512 }),
  valueCoinReceived: varchar("value_coin_received", { length: 64 }),
  txidIn: varchar("txid_in", { length: 256 }),
  txidOut: varchar("txid_out", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    email: varchar("email", { length: 256 }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    encryptedWalletAddress: text("encrypted_wallet_address").notNull(),
    walletIv: varchar("wallet_iv", { length: 64 }).notNull(),
    walletTag: varchar("wallet_tag", { length: 64 }).notNull(),
    swellCouponId: varchar("swell_coupon_id", { length: 128 }),
    discountCode: varchar("discount_code", { length: 128 }),
    discountPercent: varchar("discount_percent", { length: 16 }),
    socialProfiles: jsonb("social_profiles")
      .$type<AffiliateSocialProfile[]>()
      .default([])
      .notNull(),
    commissionRate: varchar("commission_rate", { length: 16 })
      .default("0.10")
      .notNull(),
    status: affiliateStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("affiliates_code_idx").on(table.code),
    uniqueIndex("affiliates_email_idx").on(table.email),
    index("affiliates_discount_code_idx").on(table.discountCode),
  ],
);

export const affiliateVisits = pgTable(
  "affiliate_visits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    visitorId: varchar("visitor_id", { length: 128 }).notNull(),
    referralPath: varchar("referral_path", { length: 512 }),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("affiliate_visits_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_visits_affiliate_code_idx").on(table.affiliateCode),
    index("affiliate_visits_visitor_id_idx").on(table.visitorId),
    index("affiliate_visits_created_at_idx").on(table.createdAt),
  ],
);

export const affiliateWeeklyPayouts = pgTable(
  "affiliate_weekly_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    commissionMonthKey: varchar("commission_month_key", { length: 7 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    periodTimezone: varchar("period_timezone", { length: 64 })
      .default("America/Toronto")
      .notNull(),
    earningCount: integer("earning_count").default(0).notNull(),
    totalNormalizedCommissionAmount: varchar(
      "total_normalized_commission_amount",
      { length: 32 },
    )
      .default("0.00")
      .notNull(),
    payoutCurrencyCode: varchar("payout_currency_code", { length: 8 })
      .default("USD")
      .notNull(),
    currentTierKey: varchar("current_tier_key", { length: 32 }),
    currentTierLabel: varchar("current_tier_label", { length: 64 }),
    nextTierKey: varchar("next_tier_key", { length: 32 }),
    nextTierLabel: varchar("next_tier_label", { length: 64 }),
    amountToNextTier: varchar("amount_to_next_tier", { length: 32 }),
    effectiveRate: varchar("effective_rate", { length: 16 }),
    encryptedWalletAddress: text("encrypted_wallet_address"),
    walletIv: varchar("wallet_iv", { length: 64 }),
    walletTag: varchar("wallet_tag", { length: 64 }),
    txHash: varchar("tx_hash", { length: 128 }),
    adminNotes: text("admin_notes"),
    status: payoutStatusEnum("status").default("pending").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("affiliate_weekly_payouts_period_idx").on(
      table.affiliateId,
      table.commissionMonthKey,
      table.periodStart,
      table.periodEnd,
    ),
    index("affiliate_weekly_payouts_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_weekly_payouts_status_idx").on(table.status),
    index("affiliate_weekly_payouts_period_start_idx").on(table.periodStart),
  ],
);

export const affiliatePayouts = pgTable(
  "affiliate_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => checkoutOrders.orderId),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    orderTotal: varchar("order_total", { length: 32 }).notNull(),
    commissionMonthKey: varchar("commission_month_key", { length: 7 }),
    commissionTierKey: varchar("commission_tier_key", { length: 32 }),
    commissionTierLabel: varchar("commission_tier_label", { length: 64 }),
    commissionRate: varchar("commission_rate", { length: 16 }).notNull(),
    commissionAmount: varchar("commission_amount", { length: 32 }).notNull(),
    normalizedOrderTotal: varchar("normalized_order_total", { length: 32 }),
    normalizedCommissionAmount: varchar("normalized_commission_amount", {
      length: 32,
    }),
    payoutCurrencyCode: varchar("payout_currency_code", { length: 8 })
      .default("USD")
      .notNull(),
    currencyCode: varchar("currency_code", { length: 8 }).notNull(),
    paymentProvider: varchar("payment_provider", { length: 32 }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }),
    payoutPeriodStart: timestamp("payout_period_start", { withTimezone: true }),
    payoutPeriodEnd: timestamp("payout_period_end", { withTimezone: true }),
    payoutPeriodTimezone: varchar("payout_period_timezone", { length: 64 })
      .default("America/Toronto")
      .notNull(),
    weeklyPayoutId: uuid("weekly_payout_id").references(
      () => affiliateWeeklyPayouts.id,
      { onDelete: "set null" },
    ),
    earnedEmailSentAt: timestamp("earned_email_sent_at", {
      withTimezone: true,
    }),
    status: payoutStatusEnum("status").default("pending").notNull(),
    txHash: varchar("tx_hash", { length: 128 }),
    adminNotes: text("admin_notes"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("affiliate_payouts_order_id_idx").on(table.orderId),
    index("affiliate_payouts_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_payouts_status_idx").on(table.status),
    index("affiliate_payouts_month_key_idx").on(table.commissionMonthKey),
    index("affiliate_payouts_weekly_payout_id_idx").on(table.weeklyPayoutId),
    index("affiliate_payouts_period_start_idx").on(table.payoutPeriodStart),
  ],
);

export const affiliateDiscountChanges = pgTable(
  "affiliate_discount_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    swellCouponId: varchar("swell_coupon_id", { length: 128 }),
    discountCode: varchar("discount_code", { length: 128 }),
    oldDiscountPercent: varchar("old_discount_percent", { length: 16 }),
    newDiscountPercent: varchar("new_discount_percent", { length: 16 }),
    reason: text("reason"),
    changedByUserId: text("changed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    changeScope: varchar("change_scope", { length: 32 })
      .default("single")
      .notNull(),
    batchId: varchar("batch_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("affiliate_discount_changes_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_discount_changes_created_at_idx").on(table.createdAt),
    index("affiliate_discount_changes_batch_id_idx").on(table.batchId),
  ],
);

export const affiliateCommissionTiers = pgTable(
  "affiliate_commission_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 32 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    minRevenue: varchar("min_revenue", { length: 32 }).notNull(),
    maxRevenue: varchar("max_revenue", { length: 32 }),
    rate: varchar("rate", { length: 16 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("affiliate_commission_tiers_key_idx").on(table.key),
    uniqueIndex("affiliate_commission_tiers_sort_order_idx").on(table.sortOrder),
    index("affiliate_commission_tiers_active_idx").on(table.active),
  ],
);

export const affiliateCommissionMonths = pgTable(
  "affiliate_commission_months",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    monthKey: varchar("month_key", { length: 7 }).notNull(),
    startingRate: varchar("starting_rate", { length: 16 }).notNull(),
    carriedForwardFromMonthKey: varchar("carried_forward_from_month_key", {
      length: 7,
    }),
    recognizedRevenue: varchar("recognized_revenue", { length: 32 })
      .default("0.00")
      .notNull(),
    recognizedOrderCount: integer("recognized_order_count").default(0).notNull(),
    tierKey: varchar("tier_key", { length: 32 }).notNull(),
    tierLabel: varchar("tier_label", { length: 64 }).notNull(),
    effectiveRate: varchar("effective_rate", { length: 16 }).notNull(),
    overrideRate: varchar("override_rate", { length: 16 }),
    overrideReason: text("override_reason"),
    overrideByUserId: text("override_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("affiliate_commission_months_affiliate_month_idx").on(
      table.affiliateId,
      table.monthKey,
    ),
    index("affiliate_commission_months_month_key_idx").on(table.monthKey),
    index("affiliate_commission_months_effective_rate_idx").on(
      table.effectiveRate,
    ),
  ],
);

export const affiliateCommissionEvents = pgTable(
  "affiliate_commission_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    monthKey: varchar("month_key", { length: 7 }).notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    oldRate: varchar("old_rate", { length: 16 }),
    newRate: varchar("new_rate", { length: 16 }),
    revenueSnapshot: jsonb("revenue_snapshot"),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    batchId: varchar("batch_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("affiliate_commission_events_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_commission_events_month_key_idx").on(table.monthKey),
    index("affiliate_commission_events_created_at_idx").on(table.createdAt),
  ],
);

export const checkoutDrafts = pgTable(
  "checkout_drafts",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    email: varchar("email", { length: 256 }).notNull(),
    cartSnapshot: jsonb("cart_snapshot").notNull(),
    shippingAddress: jsonb("shipping_address"),
    totalsEstimate: jsonb("totals_estimate"),
    paymentCompleted: timestamp("payment_completed", { withTimezone: true }),
    abandonmentEventSent: timestamp("abandonment_event_sent", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("checkout_drafts_email_idx").on(table.email),
    index("checkout_drafts_updated_at_idx").on(table.updatedAt),
  ],
);

export const productNotificationDispatches = pgTable(
  "product_notification_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    swellCouponId: varchar("swell_coupon_id", { length: 128 }).notNull(),
    discountCode: varchar("discount_code", { length: 128 }).notNull(),
    discountExpiresAt: timestamp("discount_expires_at", {
      withTimezone: true,
    }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    selectedTargetCount: integer("selected_target_count").default(0).notNull(),
    eligibleTargetCount: integer("eligible_target_count").default(0).notNull(),
    skippedTargetCount: integer("skipped_target_count").default(0).notNull(),
    subscriptionCount: integer("subscription_count").default(0).notNull(),
    notifiedCount: integer("notified_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    status: productNotificationDispatchStatusEnum("status")
      .default("pending")
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("product_notification_dispatches_status_idx").on(table.status),
    index("product_notification_dispatches_started_at_idx").on(table.startedAt),
    index("product_notification_dispatches_created_by_user_id_idx").on(
      table.createdByUserId,
    ),
  ],
);

export const productNotificationSubscriptions = pgTable(
  "product_notification_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 256 }).notNull(),
    normalizedEmail: varchar("normalized_email", { length: 256 }).notNull(),
    productId: varchar("product_id", { length: 128 }).notNull(),
    productHandle: varchar("product_handle", { length: 256 }).notNull(),
    productTitle: text("product_title").notNull(),
    variantId: varchar("variant_id", { length: 128 }),
    variantTitle: text("variant_title"),
    variantKey: varchar("variant_key", { length: 128 }).notNull(),
    status: productNotificationSubscriptionStatusEnum("status")
      .default("pending")
      .notNull(),
    signupEmailSentAt: timestamp("signup_email_sent_at", {
      withTimezone: true,
    }),
    signupEmailError: text("signup_email_error"),
    lastDispatchId: uuid("last_dispatch_id").references(
      () => productNotificationDispatches.id,
      { onDelete: "set null" },
    ),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      "product_notification_subscriptions_pending_email_variant_idx",
    )
      .on(table.normalizedEmail, table.productHandle, table.variantKey)
      .where(sql`${table.status} = 'pending'`),
    index("product_notification_subscriptions_status_idx").on(table.status),
    index("product_notification_subscriptions_product_handle_idx").on(
      table.productHandle,
    ),
    index("product_notification_subscriptions_variant_key_idx").on(
      table.variantKey,
    ),
    index("product_notification_subscriptions_created_at_idx").on(
      table.createdAt,
    ),
    index("product_notification_subscriptions_last_dispatch_id_idx").on(
      table.lastDispatchId,
    ),
  ],
);

export const productNotificationDispatchProducts = pgTable(
  "product_notification_dispatch_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => productNotificationDispatches.id, {
        onDelete: "cascade",
      }),
    productId: varchar("product_id", { length: 128 }).notNull(),
    productHandle: varchar("product_handle", { length: 256 }).notNull(),
    productTitle: text("product_title").notNull(),
    variantId: varchar("variant_id", { length: 128 }),
    variantTitle: text("variant_title"),
    variantKey: varchar("variant_key", { length: 128 }).notNull(),
    subscriberCount: integer("subscriber_count").default(0).notNull(),
    notifiedCount: integer("notified_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("product_notification_dispatch_products_dispatch_id_idx").on(
      table.dispatchId,
    ),
    index("product_notification_dispatch_products_product_handle_idx").on(
      table.productHandle,
    ),
    index("product_notification_dispatch_products_variant_key_idx").on(
      table.variantKey,
    ),
    uniqueIndex("product_notification_dispatch_products_dispatch_target_idx").on(
      table.dispatchId,
      table.productHandle,
      table.variantKey,
    ),
  ],
);

// ── Research: peptides & papers ──

export const researchPeptides = pgTable(
  "research_peptides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    fullName: varchar("full_name", { length: 256 }),
    sequence: text("sequence"),
    description: text("description"),
    molecularWeight: varchar("molecular_weight", { length: 64 }),
    cas: varchar("cas", { length: 64 }),
    productSlug: varchar("product_slug", { length: 128 }),
    heroImageUrl: text("hero_image_url"),
    heroImageAlt: text("hero_image_alt"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: researchPaperStatusEnum("status").default("published").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("research_peptides_slug_idx").on(table.slug),
    index("research_peptides_status_idx").on(table.status),
    index("research_peptides_sort_order_idx").on(table.sortOrder),
  ],
);

export const researchPapers = pgTable(
  "research_papers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 256 }).notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    excerpt: text("excerpt"),
    heroImageUrl: text("hero_image_url"),
    heroImageAlt: text("hero_image_alt"),
    authors: jsonb("authors")
      .$type<ResearchPaperAuthor[]>()
      .default([])
      .notNull(),
    publicationDate: timestamp("publication_date", { withTimezone: true }),
    doi: varchar("doi", { length: 256 }),
    externalUrl: text("external_url"),
    mdxContent: text("mdx_content").default("").notNull(),
    readingTimeMinutes: integer("reading_time_minutes").default(0).notNull(),
    topics: jsonb("topics").$type<string[]>().default([]).notNull(),
    status: researchPaperStatusEnum("status").default("draft").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    ogImageUrl: text("og_image_url"),
    canonicalUrl: text("canonical_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("research_papers_slug_idx").on(table.slug),
    index("research_papers_status_idx").on(table.status),
    index("research_papers_published_at_idx").on(table.publishedAt),
    index("research_papers_status_published_idx").on(
      table.status,
      table.publishedAt,
    ),
  ],
);

export const researchPaperPeptides = pgTable(
  "research_paper_peptides",
  {
    paperId: uuid("paper_id")
      .notNull()
      .references(() => researchPapers.id, { onDelete: "cascade" }),
    peptideId: uuid("peptide_id")
      .notNull()
      .references(() => researchPeptides.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.paperId, table.peptideId] }),
    index("research_paper_peptides_paper_id_idx").on(table.paperId),
    index("research_paper_peptides_peptide_id_idx").on(table.peptideId),
  ],
);

export const researchPeptidesRelations = relations(
  researchPeptides,
  ({ many }) => ({
    paperLinks: many(researchPaperPeptides),
  }),
);

export const researchPapersRelations = relations(
  researchPapers,
  ({ many, one }) => ({
    peptideLinks: many(researchPaperPeptides),
    author: one(user, {
      fields: [researchPapers.createdBy],
      references: [user.id],
    }),
  }),
);

export const researchPaperPeptidesRelations = relations(
  researchPaperPeptides,
  ({ one }) => ({
    paper: one(researchPapers, {
      fields: [researchPaperPeptides.paperId],
      references: [researchPapers.id],
    }),
    peptide: one(researchPeptides, {
      fields: [researchPaperPeptides.peptideId],
      references: [researchPeptides.id],
    }),
  }),
);
