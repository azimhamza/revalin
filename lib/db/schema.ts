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

export const promoterStatusEnum = pgEnum("promoter_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export const promoterInviteStatusEnum = pgEnum("promoter_invite_status", [
  "invited",
  "applied",
  "successful",
  "rejected",
  "cancelled",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "approved",
  "paid",
  "rejected",
]);

export const payoutBatchTypeEnum = pgEnum("payout_batch_type", [
  "weekly",
  "pay_now",
]);

export const payoutMethodEnum = pgEnum("payout_method", [
  "crypto_usdc_polygon",
  "ach_bank_transfer",
]);

export const achAccountTypeEnum = pgEnum("ach_account_type", [
  "checking",
  "savings",
]);

export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "pending",
  "label_ready",
  "packed",
  "handed_to_carrier",
  "error",
  "not_required",
]);

export const checkoutSessionStatusEnum = pgEnum("checkout_session_status", [
  "draft",
  "quoted",
  "finalizing",
  "finalized",
  "expired",
]);

export const productNotificationSubscriptionStatusEnum = pgEnum(
  "product_notification_subscription_status",
  ["pending", "notified"],
);

export const productNotificationDispatchStatusEnum = pgEnum(
  "product_notification_dispatch_status",
  ["pending", "completed", "partial_failure", "failed"],
);

export const interacEmailEventStatusEnum = pgEnum("interac_email_event_status", [
  "received",
  "matched_paid",
  "matched_partial",
  "review_required",
  "ignored",
  "parser_failed",
]);

export const interacReviewStatusEnum = pgEnum("interac_review_status", [
  "open",
  "resolved",
  "ignored",
  "refunded",
]);

export const researchPaperStatusEnum = pgEnum("research_paper_status", [
  "draft",
  "published",
  "archived",
]);

export const inventoryItemTypeEnum = pgEnum("inventory_item_type", [
  "sellable_product",
  "packaging",
  "label",
  "sticker",
  "card",
  "insert",
  "supply",
  "other",
]);

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "initial_stock",
  "purchase_received",
  "manual_adjustment",
  "fulfillment_consumed",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

export const purchasePaymentStatusEnum = pgEnum("purchase_payment_status", [
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
  "void",
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
  referredByAffiliateCode: varchar("referred_by_affiliate_code", {
    length: 64,
  }),
  referredByAffiliateAt: timestamp("referred_by_affiliate_at", {
    withTimezone: true,
  }),
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

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    index("verification_expires_at_idx").on(table.expiresAt),
  ],
);

// ── Existing app tables ──

export const checkoutOrders = pgTable(
  "checkout_orders",
  {
    orderId: varchar("order_id", { length: 64 }).primaryKey(),
    accessKey: varchar("access_key", { length: 128 }).notNull(),
    cartId: varchar("cart_id", { length: 128 }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: varchar("email", { length: 256 }),
    paymentStatus: varchar("payment_status", { length: 64 }),
    currencyCode: varchar("currency_code", { length: 8 }).notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    shippingService: jsonb("shipping_service"),
    lines: jsonb("lines").notNull(),
    totals: jsonb("totals").notNull(),
    payment: jsonb("payment").notNull(),
    swell: jsonb("swell").notNull(),
    shipengine: jsonb("shipengine"),
    fulfillment: jsonb("fulfillment"),
    affiliate: jsonb("affiliate"),
    promoter: jsonb("promoter"),
    ipnEvents: jsonb("ipn_events"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").default(
      "pending",
    ),
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
    index("checkout_orders_email_idx").on(table.email),
    index("checkout_orders_payment_status_idx").on(table.paymentStatus),
    index("checkout_orders_email_payment_status_user_id_idx").on(
      table.email,
      table.paymentStatus,
      table.userId,
    ),
    index("checkout_orders_updated_at_idx").on(table.updatedAt),
    index("checkout_orders_fulfillment_status_idx").on(
      table.fulfillmentStatus,
    ),
  ],
);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bankfulPaymentAttempts = pgTable(
  "bankful_payment_attempts",
  {
    attemptId: varchar("attempt_id", { length: 96 }).primaryKey(),
    checkoutSessionId: varchar("checkout_session_id", { length: 128 }).notNull(),
    checkoutSessionVersion: integer("checkout_session_version").notNull(),
    cartId: varchar("cart_id", { length: 128 }),
    orderId: varchar("order_id", { length: 64 }).references(
      () => checkoutOrders.orderId,
      { onDelete: "set null" },
    ),
    email: varchar("email", { length: 256 }),
    status: varchar("status", { length: 64 }).notNull(),
    amount: varchar("amount", { length: 32 }).notNull(),
    currencyCode: varchar("currency_code", { length: 8 }).notNull(),
    customer: jsonb("customer").notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    shippingService: jsonb("shipping_service"),
    lines: jsonb("lines").notNull(),
    totals: jsonb("totals").notNull(),
    swell: jsonb("swell"),
    bankful: jsonb("bankful"),
    latestError: text("latest_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("bankful_payment_attempts_session_version_idx").on(
      table.checkoutSessionId,
      table.checkoutSessionVersion,
    ),
    index("bankful_payment_attempts_order_id_idx").on(table.orderId),
    index("bankful_payment_attempts_email_idx").on(table.email),
    index("bankful_payment_attempts_status_idx").on(table.status),
    index("bankful_payment_attempts_updated_at_idx").on(table.updatedAt),
  ],
);

export const inventoryCategories = pgTable(
  "inventory_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_categories_code_idx").on(table.code),
    index("inventory_categories_active_idx").on(table.active),
    index("inventory_categories_sort_order_idx").on(table.sortOrder),
  ],
);

export const inventoryVendors = pgTable(
  "inventory_vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    contactName: varchar("contact_name", { length: 256 }),
    email: varchar("email", { length: 256 }),
    phone: varchar("phone", { length: 64 }),
    website: text("website"),
    paymentTerms: varchar("payment_terms", { length: 128 }),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_vendors_code_idx").on(table.code),
    index("inventory_vendors_name_idx").on(table.name),
    index("inventory_vendors_active_idx").on(table.active),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").references(() => inventoryCategories.id, {
      onDelete: "set null",
    }),
    defaultVendorId: uuid("default_vendor_id").references(
      () => inventoryVendors.id,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 256 }).notNull(),
    code: varchar("code", { length: 96 }).notNull(),
    sku: varchar("sku", { length: 128 }),
    barcode: varchar("barcode", { length: 128 }),
    itemType: inventoryItemTypeEnum("item_type").default("supply").notNull(),
    unit: varchar("unit", { length: 32 }).default("unit").notNull(),
    location: varchar("location", { length: 256 }),
    reorderPoint: integer("reorder_point").default(0).notNull(),
    swellProductId: varchar("swell_product_id", { length: 128 }),
    swellVariantId: varchar("swell_variant_id", { length: 128 }),
    productHandle: varchar("product_handle", { length: 256 }),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_items_code_idx").on(table.code),
    index("inventory_items_category_id_idx").on(table.categoryId),
    index("inventory_items_vendor_id_idx").on(table.defaultVendorId),
    index("inventory_items_type_idx").on(table.itemType),
    index("inventory_items_sku_idx").on(table.sku),
    index("inventory_items_barcode_idx").on(table.barcode),
    index("inventory_items_swell_product_idx").on(table.swellProductId),
    index("inventory_items_swell_variant_idx").on(table.swellVariantId),
    index("inventory_items_product_handle_idx").on(table.productHandle),
    index("inventory_items_active_idx").on(table.active),
  ],
);

export const inventoryConsumptionRules = pgTable(
  "inventory_consumption_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    consumedItemId: uuid("consumed_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    appliesToItemId: uuid("applies_to_item_id").references(
      () => inventoryItems.id,
      { onDelete: "cascade" },
    ),
    appliesToSwellProductId: varchar("applies_to_swell_product_id", {
      length: 128,
    }),
    appliesToSwellVariantId: varchar("applies_to_swell_variant_id", {
      length: 128,
    }),
    appliesToProductHandle: varchar("applies_to_product_handle", {
      length: 256,
    }),
    quantityPerOrder: integer("quantity_per_order").default(1).notNull(),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("inventory_consumption_rules_consumed_item_idx").on(
      table.consumedItemId,
    ),
    index("inventory_consumption_rules_applies_item_idx").on(
      table.appliesToItemId,
    ),
    index("inventory_consumption_rules_swell_product_idx").on(
      table.appliesToSwellProductId,
    ),
    index("inventory_consumption_rules_swell_variant_idx").on(
      table.appliesToSwellVariantId,
    ),
    index("inventory_consumption_rules_handle_idx").on(
      table.appliesToProductHandle,
    ),
    index("inventory_consumption_rules_active_idx").on(table.active),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poNumber: varchar("po_number", { length: 96 }).notNull(),
    vendorId: uuid("vendor_id").references(() => inventoryVendors.id, {
      onDelete: "set null",
    }),
    status: purchaseOrderStatusEnum("status").default("draft").notNull(),
    paymentStatus: purchasePaymentStatusEnum("payment_status")
      .default("unpaid")
      .notNull(),
    currencyCode: varchar("currency_code", { length: 8 })
      .default("USD")
      .notNull(),
    totalAmount: varchar("total_amount", { length: 32 })
      .default("0.00")
      .notNull(),
    amountPaid: varchar("amount_paid", { length: 32 })
      .default("0.00")
      .notNull(),
    paymentMethod: varchar("payment_method", { length: 64 }),
    paymentReference: varchar("payment_reference", { length: 256 }),
    proofUrls: jsonb("proof_urls").$type<string[]>().default([]).notNull(),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
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
    uniqueIndex("purchase_orders_po_number_idx").on(table.poNumber),
    index("purchase_orders_vendor_id_idx").on(table.vendorId),
    index("purchase_orders_status_idx").on(table.status),
    index("purchase_orders_payment_status_idx").on(table.paymentStatus),
    index("purchase_orders_updated_at_idx").on(table.updatedAt),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    quantityOrdered: integer("quantity_ordered").notNull(),
    quantityReceived: integer("quantity_received").default(0).notNull(),
    unitCost: varchar("unit_cost", { length: 32 }).default("0.00").notNull(),
    lineTotal: varchar("line_total", { length: 32 }).default("0.00").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("purchase_order_lines_order_id_idx").on(table.purchaseOrderId),
    index("purchase_order_lines_item_id_idx").on(table.itemId),
  ],
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    receiptNumber: varchar("receipt_number", { length: 96 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    receivedByUserId: text("received_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    proofUrls: jsonb("proof_urls").$type<string[]>().default([]).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("purchase_receipts_receipt_number_idx").on(
      table.receiptNumber,
    ),
    index("purchase_receipts_order_id_idx").on(table.purchaseOrderId),
    index("purchase_receipts_received_at_idx").on(table.receivedAt),
  ],
);

export const purchaseReceiptLines = pgTable(
  "purchase_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: "cascade" }),
    purchaseOrderLineId: uuid("purchase_order_line_id")
      .notNull()
      .references(() => purchaseOrderLines.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    quantityReceived: integer("quantity_received").notNull(),
    unitCost: varchar("unit_cost", { length: 32 }).default("0.00").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("purchase_receipt_lines_receipt_id_idx").on(table.receiptId),
    index("purchase_receipt_lines_order_line_idx").on(
      table.purchaseOrderLineId,
    ),
    index("purchase_receipt_lines_item_id_idx").on(table.itemId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    unitCost: varchar("unit_cost", { length: 32 }),
    purchaseOrderId: uuid("purchase_order_id").references(
      () => purchaseOrders.id,
      { onDelete: "set null" },
    ),
    purchaseReceiptId: uuid("purchase_receipt_id").references(
      () => purchaseReceipts.id,
      { onDelete: "set null" },
    ),
    purchaseReceiptLineId: uuid("purchase_receipt_line_id").references(
      () => purchaseReceiptLines.id,
      { onDelete: "set null" },
    ),
    checkoutOrderId: varchar("checkout_order_id", { length: 64 }).references(
      () => checkoutOrders.orderId,
      { onDelete: "set null" },
    ),
    checkoutOrderNumber: varchar("checkout_order_number", { length: 96 }),
    sourceType: varchar("source_type", { length: 64 }),
    sourceId: varchar("source_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_movements_idempotency_key_idx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("inventory_movements_item_id_idx").on(table.itemId),
    index("inventory_movements_type_idx").on(table.movementType),
    index("inventory_movements_purchase_order_idx").on(table.purchaseOrderId),
    index("inventory_movements_purchase_receipt_idx").on(
      table.purchaseReceiptId,
    ),
    index("inventory_movements_checkout_order_idx").on(table.checkoutOrderId),
    index("inventory_movements_created_at_idx").on(table.createdAt),
  ],
);

export const researchAccessConsents = pgTable(
  "research_access_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consentToken: varchar("consent_token", { length: 128 }).notNull(),
    termsVersion: varchar("terms_version", { length: 32 }).notNull(),
    minimumAge: integer("minimum_age").notNull(),
    termsAccepted: boolean("terms_accepted").default(true).notNull(),
    researchUseAccepted: boolean("research_use_accepted").default(true).notNull(),
    institutionName: varchar("institution_name", { length: 256 }),
    institutionIdentifier: varchar("institution_identifier", { length: 128 }),
    researchUseDescription: text("research_use_description"),
    institutionNameProvided: boolean("institution_name_provided")
      .default(false)
      .notNull(),
    institutionIdentifierProvided: boolean("institution_identifier_provided")
      .default(false)
      .notNull(),
    researchUseDescriptionProvided: boolean(
      "research_use_description_provided",
    )
      .default(false)
      .notNull(),
    email: varchar("email", { length: 256 }),
    normalizedEmail: varchar("normalized_email", { length: 256 }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    entryPath: varchar("entry_path", { length: 512 }),
    referrer: text("referrer"),
    metadata: jsonb("metadata"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("research_access_consents_token_idx").on(table.consentToken),
    index("research_access_consents_email_idx").on(table.normalizedEmail),
    index("research_access_consents_user_id_idx").on(table.userId),
    index("research_access_consents_accepted_at_idx").on(table.acceptedAt),
  ],
);

export const researchAccessConsentEvents = pgTable(
  "research_access_consent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => researchAccessConsents.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    source: varchar("source", { length: 64 }),
    email: varchar("email", { length: 256 }),
    normalizedEmail: varchar("normalized_email", { length: 256 }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    checkoutOrderId: varchar("checkout_order_id", { length: 64 }).references(
      () => checkoutOrders.orderId,
      { onDelete: "set null" },
    ),
    checkoutSessionId: varchar("checkout_session_id", { length: 128 }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("research_access_consent_events_consent_id_idx").on(table.consentId),
    index("research_access_consent_events_type_idx").on(table.eventType),
    index("research_access_consent_events_email_idx").on(table.normalizedEmail),
    index("research_access_consent_events_user_id_idx").on(table.userId),
    index("research_access_consent_events_order_id_idx").on(
      table.checkoutOrderId,
    ),
    index("research_access_consent_events_created_at_idx").on(table.createdAt),
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

export const gmailWatchState = pgTable(
  "gmail_watch_state",
  {
    mailbox: varchar("mailbox", { length: 256 }).primaryKey(),
    topicName: text("topic_name").notNull(),
    lastHistoryId: varchar("last_history_id", { length: 128 }),
    expiration: timestamp("expiration", { withTimezone: true }),
    lastRenewedAt: timestamp("last_renewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("gmail_watch_state_updated_at_idx").on(table.updatedAt)],
);

export const interacEmailEvents = pgTable(
  "interac_email_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gmailMessageId: varchar("gmail_message_id", { length: 128 }).notNull(),
    pubsubMessageId: varchar("pubsub_message_id", { length: 128 }),
    historyId: varchar("history_id", { length: 128 }),
    status: interacEmailEventStatusEnum("status").default("received").notNull(),
    matchedOrderId: varchar("matched_order_id", { length: 64 }).references(
      () => checkoutOrders.orderId,
      { onDelete: "set null" },
    ),
    reviewReason: varchar("review_reason", { length: 64 }),
    parserError: text("parser_error"),
    subject: text("subject"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    replyToAddress: text("reply_to_address"),
    authenticationResults: text("authentication_results"),
    authenticity: jsonb("authenticity"),
    parsed: jsonb("parsed"),
    rawText: text("raw_text"),
    rawHtml: text("raw_html"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("interac_email_events_gmail_message_unique_idx").on(
      table.gmailMessageId,
    ),
    index("interac_email_events_status_idx").on(table.status),
    index("interac_email_events_matched_order_idx").on(table.matchedOrderId),
    index("interac_email_events_created_at_idx").on(table.createdAt),
  ],
);

export const interacReviewItems = pgTable(
  "interac_review_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: varchar("order_id", { length: 64 }).references(
      () => checkoutOrders.orderId,
      { onDelete: "set null" },
    ),
    eventId: uuid("event_id").references(() => interacEmailEvents.id, {
      onDelete: "set null",
    }),
    status: interacReviewStatusEnum("status").default("open").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    expectedAmount: varchar("expected_amount", { length: 32 }),
    receivedAmount: varchar("received_amount", { length: 32 }),
    messageCode: varchar("message_code", { length: 64 }),
    senderName: text("sender_name"),
    senderEmail: text("sender_email"),
    bankReference: varchar("bank_reference", { length: 128 }),
    screenshotUrls: jsonb("screenshot_urls"),
    adminNotes: text("admin_notes"),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("interac_review_items_status_idx").on(table.status),
    index("interac_review_items_order_idx").on(table.orderId),
    index("interac_review_items_reason_idx").on(table.reason),
    index("interac_review_items_created_at_idx").on(table.createdAt),
  ],
);

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
      .default("0.15")
      .notNull(),
    payoutMethod: payoutMethodEnum("payout_method")
      .default("crypto_usdc_polygon")
      .notNull(),
    achAccountHolderName: varchar("ach_account_holder_name", { length: 256 }),
    achBankName: varchar("ach_bank_name", { length: 256 }),
    achAccountType: achAccountTypeEnum("ach_account_type"),
    encryptedAchRoutingNumber: text("encrypted_ach_routing_number"),
    achRoutingNumberIv: varchar("ach_routing_number_iv", { length: 64 }),
    achRoutingNumberTag: varchar("ach_routing_number_tag", { length: 64 }),
    achRoutingNumberLast4: varchar("ach_routing_number_last4", { length: 4 }),
    encryptedAchAccountNumber: text("encrypted_ach_account_number"),
    achAccountNumberIv: varchar("ach_account_number_iv", { length: 64 }),
    achAccountNumberTag: varchar("ach_account_number_tag", { length: 64 }),
    achAccountNumberLast4: varchar("ach_account_number_last4", { length: 4 }),
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
    index("affiliates_user_id_idx").on(table.userId),
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
    batchType: payoutBatchTypeEnum("batch_type").default("weekly").notNull(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    commissionMonthKey: varchar("commission_month_key", {
      length: 7,
    }).notNull(),
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
    payoutMethod: payoutMethodEnum("payout_method")
      .default("crypto_usdc_polygon")
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
    achAccountHolderName: varchar("ach_account_holder_name", { length: 256 }),
    achBankName: varchar("ach_bank_name", { length: 256 }),
    achAccountType: achAccountTypeEnum("ach_account_type"),
    encryptedAchRoutingNumber: text("encrypted_ach_routing_number"),
    achRoutingNumberIv: varchar("ach_routing_number_iv", { length: 64 }),
    achRoutingNumberTag: varchar("ach_routing_number_tag", { length: 64 }),
    achRoutingNumberLast4: varchar("ach_routing_number_last4", { length: 4 }),
    encryptedAchAccountNumber: text("encrypted_ach_account_number"),
    achAccountNumberIv: varchar("ach_account_number_iv", { length: 64 }),
    achAccountNumberTag: varchar("ach_account_number_tag", { length: 64 }),
    achAccountNumberLast4: varchar("ach_account_number_last4", { length: 4 }),
    payoutFeeRate: varchar("payout_fee_rate", { length: 16 })
      .default("0")
      .notNull(),
    payoutFeeAmount: varchar("payout_fee_amount", { length: 32 })
      .default("0.00")
      .notNull(),
    netPayoutAmount: varchar("net_payout_amount", { length: 32 })
      .default("0.00")
      .notNull(),
    txHash: varchar("tx_hash", { length: 128 }),
    paymentReference: varchar("payment_reference", { length: 256 }),
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
      table.batchType,
    ),
    uniqueIndex("affiliate_weekly_payouts_open_pay_now_idx")
      .on(table.affiliateId, table.commissionMonthKey)
      .where(
        sql`${table.batchType} = 'pay_now' AND ${table.status} IN ('pending', 'approved')`,
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
    uniqueIndex("affiliate_payouts_order_id_unique_idx").on(table.orderId),
    index("affiliate_payouts_affiliate_id_idx").on(table.affiliateId),
    index("affiliate_payouts_status_idx").on(table.status),
    index("affiliate_payouts_month_key_idx").on(table.commissionMonthKey),
    index("affiliate_payouts_weekly_payout_id_idx").on(table.weeklyPayoutId),
    index("affiliate_payouts_period_start_idx").on(table.payoutPeriodStart),
  ],
);

export const promoters = pgTable(
  "promoters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    email: varchar("email", { length: 256 }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    encryptedWalletAddress: text("encrypted_wallet_address").notNull(),
    walletIv: varchar("wallet_iv", { length: 64 }).notNull(),
    walletTag: varchar("wallet_tag", { length: 64 }).notNull(),
    socialProfiles: jsonb("social_profiles")
      .$type<AffiliateSocialProfile[]>()
      .default([])
      .notNull(),
    defaultCommissionRate: varchar("default_commission_rate", { length: 16 })
      .default("0.025")
      .notNull(),
    payoutMethod: payoutMethodEnum("payout_method")
      .default("crypto_usdc_polygon")
      .notNull(),
    achAccountHolderName: varchar("ach_account_holder_name", { length: 256 }),
    achBankName: varchar("ach_bank_name", { length: 256 }),
    achAccountType: achAccountTypeEnum("ach_account_type"),
    encryptedAchRoutingNumber: text("encrypted_ach_routing_number"),
    achRoutingNumberIv: varchar("ach_routing_number_iv", { length: 64 }),
    achRoutingNumberTag: varchar("ach_routing_number_tag", { length: 64 }),
    achRoutingNumberLast4: varchar("ach_routing_number_last4", { length: 4 }),
    encryptedAchAccountNumber: text("encrypted_ach_account_number"),
    achAccountNumberIv: varchar("ach_account_number_iv", { length: 64 }),
    achAccountNumberTag: varchar("ach_account_number_tag", { length: 64 }),
    achAccountNumberLast4: varchar("ach_account_number_last4", { length: 4 }),
    status: promoterStatusEnum("status").default("approved").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("promoters_code_idx").on(table.code),
    uniqueIndex("promoters_email_idx").on(table.email),
    index("promoters_user_id_idx").on(table.userId),
    index("promoters_status_idx").on(table.status),
  ],
);

export const promoterInvites = pgTable(
  "promoter_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promoterId: uuid("promoter_id")
      .notNull()
      .references(() => promoters.id, { onDelete: "cascade" }),
    invitedAffiliateId: uuid("invited_affiliate_id").references(
      () => affiliates.id,
      { onDelete: "set null" },
    ),
    invitedName: varchar("invited_name", { length: 256 }),
    invitedEmail: varchar("invited_email", { length: 256 }).notNull(),
    normalizedInvitedEmail: varchar("normalized_invited_email", {
      length: 256,
    }).notNull(),
    socialProfiles: jsonb("social_profiles")
      .$type<AffiliateSocialProfile[]>()
      .default([])
      .notNull(),
    notes: text("notes"),
    referralCode: varchar("referral_code", { length: 64 }),
    commissionRate: varchar("commission_rate", { length: 16 }),
    status: promoterInviteStatusEnum("status").default("invited").notNull(),
    inviteEmailSentAt: timestamp("invite_email_sent_at", {
      withTimezone: true,
    }),
    inviteEmailError: text("invite_email_error"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    successfulAt: timestamp("successful_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    successfulByUserId: text("successful_by_user_id").references(
      () => user.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("promoter_invites_promoter_id_idx").on(table.promoterId),
    index("promoter_invites_status_idx").on(table.status),
    index("promoter_invites_invited_email_idx").on(
      table.normalizedInvitedEmail,
    ),
    index("promoter_invites_invited_affiliate_id_idx").on(
      table.invitedAffiliateId,
    ),
    index("promoter_invites_referral_code_idx").on(table.referralCode),
    uniqueIndex("promoter_invites_active_affiliate_idx")
      .on(table.invitedAffiliateId)
      .where(
        sql`${table.status} IN ('invited', 'applied', 'successful') AND ${table.invitedAffiliateId} IS NOT NULL`,
      ),
    uniqueIndex("promoter_invites_successful_affiliate_idx")
      .on(table.invitedAffiliateId)
      .where(
        sql`${table.status} = 'successful' AND ${table.invitedAffiliateId} IS NOT NULL`,
      ),
  ],
);

export const promoterWeeklyPayouts = pgTable(
  "promoter_weekly_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchType: payoutBatchTypeEnum("batch_type").default("weekly").notNull(),
    promoterId: uuid("promoter_id")
      .notNull()
      .references(() => promoters.id, { onDelete: "cascade" }),
    commissionMonthKey: varchar("commission_month_key", {
      length: 7,
    }).notNull(),
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
    payoutMethod: payoutMethodEnum("payout_method")
      .default("crypto_usdc_polygon")
      .notNull(),
    encryptedWalletAddress: text("encrypted_wallet_address"),
    walletIv: varchar("wallet_iv", { length: 64 }),
    walletTag: varchar("wallet_tag", { length: 64 }),
    achAccountHolderName: varchar("ach_account_holder_name", { length: 256 }),
    achBankName: varchar("ach_bank_name", { length: 256 }),
    achAccountType: achAccountTypeEnum("ach_account_type"),
    encryptedAchRoutingNumber: text("encrypted_ach_routing_number"),
    achRoutingNumberIv: varchar("ach_routing_number_iv", { length: 64 }),
    achRoutingNumberTag: varchar("ach_routing_number_tag", { length: 64 }),
    achRoutingNumberLast4: varchar("ach_routing_number_last4", { length: 4 }),
    encryptedAchAccountNumber: text("encrypted_ach_account_number"),
    achAccountNumberIv: varchar("ach_account_number_iv", { length: 64 }),
    achAccountNumberTag: varchar("ach_account_number_tag", { length: 64 }),
    achAccountNumberLast4: varchar("ach_account_number_last4", { length: 4 }),
    payoutFeeRate: varchar("payout_fee_rate", { length: 16 })
      .default("0")
      .notNull(),
    payoutFeeAmount: varchar("payout_fee_amount", { length: 32 })
      .default("0.00")
      .notNull(),
    netPayoutAmount: varchar("net_payout_amount", { length: 32 })
      .default("0.00")
      .notNull(),
    txHash: varchar("tx_hash", { length: 128 }),
    paymentReference: varchar("payment_reference", { length: 256 }),
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
    uniqueIndex("promoter_weekly_payouts_period_idx").on(
      table.promoterId,
      table.commissionMonthKey,
      table.periodStart,
      table.periodEnd,
      table.batchType,
    ),
    uniqueIndex("promoter_weekly_payouts_open_pay_now_idx")
      .on(table.promoterId, table.commissionMonthKey)
      .where(
        sql`${table.batchType} = 'pay_now' AND ${table.status} IN ('pending', 'approved')`,
      ),
    index("promoter_weekly_payouts_promoter_id_idx").on(table.promoterId),
    index("promoter_weekly_payouts_status_idx").on(table.status),
    index("promoter_weekly_payouts_period_start_idx").on(table.periodStart),
  ],
);

export const promoterPayouts = pgTable(
  "promoter_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: varchar("order_id", { length: 64 })
      .notNull()
      .references(() => checkoutOrders.orderId),
    promoterId: uuid("promoter_id")
      .notNull()
      .references(() => promoters.id),
    promoterInviteId: uuid("promoter_invite_id")
      .notNull()
      .references(() => promoterInvites.id),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    affiliateCode: varchar("affiliate_code", { length: 64 }).notNull(),
    orderTotal: varchar("order_total", { length: 32 }).notNull(),
    commissionMonthKey: varchar("commission_month_key", { length: 7 }),
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
      () => promoterWeeklyPayouts.id,
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
    uniqueIndex("promoter_payouts_order_id_unique_idx").on(table.orderId),
    index("promoter_payouts_promoter_id_idx").on(table.promoterId),
    index("promoter_payouts_invite_id_idx").on(table.promoterInviteId),
    index("promoter_payouts_affiliate_id_idx").on(table.affiliateId),
    index("promoter_payouts_status_idx").on(table.status),
    index("promoter_payouts_month_key_idx").on(table.commissionMonthKey),
    index("promoter_payouts_weekly_payout_id_idx").on(table.weeklyPayoutId),
    index("promoter_payouts_period_start_idx").on(table.payoutPeriodStart),
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
    uniqueIndex("affiliate_commission_tiers_sort_order_idx").on(
      table.sortOrder,
    ),
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
    recognizedOrderCount: integer("recognized_order_count")
      .default(0)
      .notNull(),
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
    normalizedEmail: varchar("normalized_email", { length: 256 })
      .default("")
      .notNull(),
    sessionKey: varchar("session_key", { length: 128 }).default("").notNull(),
    version: integer("version").default(1).notNull(),
    status: checkoutSessionStatusEnum("status").default("draft").notNull(),
    cartId: varchar("cart_id", { length: 128 }),
    cartSnapshot: jsonb("cart_snapshot").notNull(),
    shippingAddress: jsonb("shipping_address"),
    selectedShippingServiceId: varchar("selected_shipping_service_id", {
      length: 128,
    }),
    shipmentProtection: boolean("shipment_protection").default(false).notNull(),
    paymentMethod: varchar("payment_method", { length: 32 }),
    paymentCurrency: varchar("payment_currency", { length: 16 }),
    sourceWalletAddress: text("source_wallet_address"),
    interacSenderEmail: varchar("interac_sender_email", { length: 256 }),
    interacSenderName: varchar("interac_sender_name", { length: 256 }),
    interacSecurityQuestion: varchar("interac_security_question", { length: 256 }),
    interacSecurityAnswer: varchar("interac_security_answer", { length: 256 }),
    discountCode: varchar("discount_code", { length: 128 }),
    pricingSnapshot: jsonb("pricing_snapshot"),
    providerQuoteCache: jsonb("provider_quote_cache"),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    finalizedOrderId: varchar("finalized_order_id", { length: 64 }),
    finalizedAccessKey: varchar("finalized_access_key", { length: 128 }),
    paymentCompleted: timestamp("payment_completed", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("checkout_drafts_email_idx").on(table.email),
    index("checkout_drafts_normalized_email_idx").on(table.normalizedEmail),
    index("checkout_drafts_cart_id_idx").on(table.cartId),
    index("checkout_drafts_status_idx").on(table.status),
    index("checkout_drafts_expires_at_idx").on(table.expiresAt),
    index("checkout_drafts_updated_at_idx").on(table.updatedAt),
  ],
);

export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    key: varchar("key", { length: 160 }).primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("api_idempotency_keys_scope_idx").on(table.scope),
    index("api_idempotency_keys_resource_id_idx").on(table.resourceId),
    index("api_idempotency_keys_expires_at_idx").on(table.expiresAt),
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
    uniqueIndex("product_notification_subscriptions_pending_email_variant_idx")
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
    uniqueIndex(
      "product_notification_dispatch_products_dispatch_target_idx",
    ).on(table.dispatchId, table.productHandle, table.variantKey),
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
