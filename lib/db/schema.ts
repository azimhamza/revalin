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
} from "drizzle-orm/pg-core";

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
    commissionRate: varchar("commission_rate", { length: 16 })
      .default("0.05")
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
    commissionRate: varchar("commission_rate", { length: 16 }).notNull(),
    commissionAmount: varchar("commission_amount", { length: 32 }).notNull(),
    currencyCode: varchar("currency_code", { length: 8 }).notNull(),
    paymentProvider: varchar("payment_provider", { length: 32 }).notNull(),
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
