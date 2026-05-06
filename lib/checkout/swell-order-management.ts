import {
  getCart as getLocalCart,
  getProduct as getSwellProduct,
} from "@/lib/swell/swell";
import type { SwellCart as StorefrontCart } from "@/lib/swell/types";
import { providerFetch } from "@/lib/api/provider-client";
import {
  buildSwellCouponCreatePayload,
  normalizeSwellCouponCode,
} from "./swell-coupon-payloads";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | QueryValue[]
  | { [key: string]: QueryValue };

type SwellBackendAddress = {
  name: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type SwellShipmentService = {
  id: string;
  name: string;
  carrier?: string;
  price: number;
  pickup?: boolean;
};

export type SwellBackendCart = {
  id: string;
  account_id?: string;
  checkout_id?: string;
  number?: string;
  currency: string;
  sub_total: number;
  discount_total?: number;
  item_discount?: number;
  grand_total: number;
  shipment_total: number;
  tax_total: number;
  item_quantity: number;
  coupon_code?: string;
  billing?: {
    method?: string;
  };
  shipping?: SwellBackendAddress & {
    service?: string;
    service_name?: string;
    price?: number;
  };
  shipment_rating?: {
    services?: SwellShipmentService[];
    errors?: Array<{ code?: string; message?: string }>;
  };
};

export type SwellBackendOrderItem = {
  id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  quantity_cancelable?: number;
  quantity_canceled?: number;
};

export type SwellBackendOrder = {
  id: string;
  number?: string;
  cart_id?: string;
  account_id: string;
  currency: string;
  sub_total: number;
  discount_total?: number;
  item_discount?: number;
  grand_total: number;
  shipment_total: number;
  tax_total: number;
  item_quantity?: number;
  coupon_code?: string;
  shipping?: SwellBackendCart["shipping"];
  billing?: {
    method?: string;
    intent?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  items?: SwellBackendOrderItem[];
};

export type SwellBackendShipment = {
  id: string;
  order_id: string;
  tracking_code?: string;
  carrier_name?: string;
  service_name?: string;
  items?: Array<{
    order_item_id?: string;
    product_id?: string;
    quantity?: number;
  }>;
};

export type SwellBackendAccount = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  shipping?: SwellBackendAddress;
  billing?: SwellBackendAddress & {
    method?: string;
  };
};

export type SwellBackendPayment = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  order_id?: string;
  account_id: string;
  transaction_id?: string;
  status?: string;
  success?: boolean;
};

export type SwellBackendCoupon = {
  id: string;
  name?: string;
  description?: string;
  active?: boolean;
  date_expired?: string;
  limit_uses?: number;
  limit_account_uses?: number;
  discounts?: Array<{
    type?: string;
    value_type?: string;
    value_percent?: number;
    value_amount?: number;
  }>;
  codes?: string[] | Array<{ code?: string }>;
};

export type SwellBackendCouponCode = {
  id: string;
  code?: string;
  parent_id?: string;
};

type SwellBackendCartItem = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type StorefrontCartSnapshotLine = {
  merchandiseId: string;
  productHandle: string;
  quantity: number;
};

export type StorefrontCartSnapshot = {
  currencyCode: string;
  lines: StorefrontCartSnapshotLine[];
};

const rawSwellStoreUrl =
  process.env.NEXT_PUBLIC_SWELL_STORE_URL ||
  process.env.SWELL_STORE_URL ||
  process.env.NEXT_PUBLIC_SWELL_STORE_DOMAIN ||
  process.env.SWELL_STORE_DOMAIN ||
  "";
const rawSwellStoreId =
  process.env.NEXT_PUBLIC_SWELL_STORE_ID || process.env.SWELL_STORE_ID || "";
const rawSwellApiUrl =
  process.env.NEXT_PUBLIC_SWELL_API_URL || process.env.SWELL_API_URL || "";
const SWELL_SECRET_KEY = (process.env.SWELL_SECRET_KEY || "").trim();
const SWELL_MANUAL_PAYMENT_METHOD = (
  process.env.SWELL_MANUAL_PAYMENT_METHOD || "crypto"
).trim();
const SWELL_CRYPTO_PAYMENT_METHOD = (
  process.env.SWELL_CRYPTO_PAYMENT_METHOD || "crypto"
).trim();
const SWELL_CARD_DEBIT_PAYMENT_METHOD = (
  process.env.SWELL_CARD_DEBIT_PAYMENT_METHOD ||
  process.env.SWELL_CARD_PAYMENT_METHOD ||
  "card_debit"
).trim();
const SWELL_INTERAC_PAYMENT_METHOD = (
  process.env.SWELL_INTERAC_PAYMENT_METHOD || "interac"
).trim();

export type SwellCheckoutPaymentMethod = "card" | "crypto" | "interac" | "square";

function normalizeExplicitApiBase(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const pathname =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return "";
  }
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function resolveSwellStoreIdentifier(
  storeUrl: string,
  storeId: string,
): string {
  const trimmedStoreId = storeId.trim();

  if (storeUrl.trim()) {
    const withProtocol = /^https?:\/\//i.test(storeUrl.trim())
      ? storeUrl.trim()
      : `https://${storeUrl.trim()}`;

    try {
      const parsed = new URL(withProtocol);
      if (parsed.hostname.endsWith(".swell.store")) {
        return parsed.hostname.replace(/\.swell\.store$/i, "");
      }
    } catch {
      // Fall back to the configured store id below.
    }
  }

  return trimmedStoreId;
}

const SWELL_STORE_IDENTIFIER = resolveSwellStoreIdentifier(
  rawSwellStoreUrl,
  rawSwellStoreId,
);
const SWELL_API_BASES = dedupe([
  normalizeExplicitApiBase(rawSwellApiUrl),
  SWELL_STORE_IDENTIFIER ? "https://api.swell.store" : "",
]);

function extractBackendIdsFromMerchandiseId(
  merchandiseId: string,
): { productId: string; variantId?: string } | null {
  const match = merchandiseId.match(
    /^swell:product:([^:]+)(?::variant:(.+))?$/,
  );
  if (!match) return null;

  const productId = decodeURIComponent(match[1] || "");
  const variantId = match[2] ? decodeURIComponent(match[2]) : undefined;

  if (!productId) return null;

  return {
    productId,
    variantId,
  };
}

function extractBackendProductId(storefrontProductId: string): string | null {
  const match = storefrontProductId.match(/^swell:\/\/product\/(.+)$/);
  if (!match) return null;

  const productId = decodeURIComponent(match[1] || "");
  return productId || null;
}

function extractSwellErrorMessages(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const payload = value as Record<string, unknown>;
  const messages: string[] = [];

  const appendNestedMessages = (nested: unknown) => {
    if (!nested || typeof nested !== "object") return;

    Object.entries(nested as Record<string, unknown>).forEach(([field, entry]) => {
      if (!entry || typeof entry !== "object") return;

      const message =
        typeof (entry as { message?: unknown }).message === "string"
          ? (entry as { message: string }).message
          : null;
      const code =
        typeof (entry as { code?: unknown }).code === "string"
          ? (entry as { code: string }).code
          : null;
      const id =
        typeof (entry as { id?: unknown }).id === "string"
          ? (entry as { id: string }).id
          : null;

      if (message) {
        const detail = [message, code, id].filter(Boolean).join(" | ");
        messages.push(field ? `${field}: ${detail}` : detail);
      }
    });
  };

  if (typeof payload.error === "string") {
    messages.push(payload.error);
  } else if (payload.error && typeof payload.error === "object") {
    const message =
      typeof (payload.error as { message?: unknown }).message === "string"
        ? (payload.error as { message: string }).message
        : null;
    const code =
      typeof (payload.error as { code?: unknown }).code === "string"
        ? (payload.error as { code: string }).code
        : null;

    if (message || code) {
      messages.push([message, code].filter(Boolean).join(" | "));
    }
  }

  appendNestedMessages(payload.errors);

  return messages;
}

function assertSwellBackendConfig() {
  if (!SWELL_SECRET_KEY) {
    throw new Error(
      "Missing SWELL_SECRET_KEY. Real Swell order management requires backend API access.",
    );
  }

  if (SWELL_API_BASES.length === 0) {
    throw new Error(
      "Missing Swell store URL. Set SWELL_STORE_ID, NEXT_PUBLIC_SWELL_STORE_URL, or SWELL_API_URL.",
    );
  }
}

function appendQueryParam(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value === undefined || value === null || value === "") return;

  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryParam(searchParams, `${key}[]`, item));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      appendQueryParam(searchParams, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }

  searchParams.append(key, String(value));
}

function buildRequestUrls(
  path: string,
  params?: Record<string, QueryValue>,
) {
  assertSwellBackendConfig();

  return SWELL_API_BASES.map((base) => {
    const url = new URL(`${base}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) =>
        appendQueryParam(url.searchParams, key, value),
      );
    }

    return url.toString();
  });
}

function buildBackendHeaders(apiUrl: string): HeadersInit[] {
  const headers: HeadersInit[] = [];
  const isGlobalApiHost = /^https:\/\/api\.swell\.store\b/i.test(apiUrl);

  const pushUnique = (next: HeadersInit) => {
    const signature = JSON.stringify(next);
    if (!headers.some((existing) => JSON.stringify(existing) === signature)) {
      headers.push(next);
    }
  };

  const pushAuthVariants = (key: string, extras?: Record<string, string>) => {
    const base = {
      "Content-Type": "application/json",
      ...(extras || {}),
    };

    pushUnique({
      ...base,
      Authorization: key,
    });

    pushUnique({
      ...base,
      Authorization: `Bearer ${key}`,
    });
  };

  if (SWELL_STORE_IDENTIFIER && SWELL_SECRET_KEY) {
    const secretBasicAuth = Buffer.from(
      `${SWELL_STORE_IDENTIFIER}:${SWELL_SECRET_KEY}`,
      "utf8",
    ).toString("base64");
    pushUnique({
      Authorization: `Basic ${secretBasicAuth}`,
      "Content-Type": "application/json",
    });
  }

  if (SWELL_STORE_IDENTIFIER && SWELL_SECRET_KEY) {
    pushAuthVariants(SWELL_SECRET_KEY, {
      "Swell-Store-Id": SWELL_STORE_IDENTIFIER,
    });
  }

  if (!isGlobalApiHost && SWELL_SECRET_KEY) {
    pushAuthVariants(SWELL_SECRET_KEY);
  }

  return headers;
}

async function swellBackendRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: {
    params?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
    timeoutMs?: number | null;
    retryable?: boolean;
  } = {},
) {
  const requestUrls = buildRequestUrls(path, options.params);
  const errors: string[] = [];

  for (const requestUrl of requestUrls) {
    const authHeaders = buildBackendHeaders(requestUrl);

    for (const headers of authHeaders) {
      const response = await providerFetch(requestUrl, {
        provider: 'swell',
        operation: `${method} ${path}`,
        method,
        headers,
        cache: "no-store",
        body: options.body ? JSON.stringify(options.body) : undefined,
        timeoutMs: options.timeoutMs,
        retryable: options.retryable ?? (method === 'GET' || method === 'DELETE'),
      });

      if (response.ok) {
        if (response.status === 204) {
          return null as T;
        }

        const text = (await response.text()).trim();
        if (!text) {
          return null as T;
        }

        const payload = JSON.parse(text) as T;
        const errorMessages = extractSwellErrorMessages(payload);
        if (errorMessages.length > 0) {
          throw new Error(
            `${method} ${requestUrl} returned: ${errorMessages.join("; ")}`,
          );
        }

        return payload;
      }

      const body = (await response.text()).trim();
      errors.push(
        `${method} ${requestUrl} [${response.status}] ${body || response.statusText}`,
      );
    }
  }

  throw new Error(errors.join("\n"));
}

function buildName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function normalizeComparableValue(value?: string | null) {
  return (value || "").trim();
}

function addressFieldMatches(left?: string | null, right?: string | null) {
  return normalizeComparableValue(left) === normalizeComparableValue(right);
}

function addressesMatch(
  current: Partial<SwellBackendAddress> | undefined,
  next: Partial<SwellBackendAddress> | undefined,
) {
  return (
    addressFieldMatches(current?.name, next?.name) &&
    addressFieldMatches(current?.first_name, next?.first_name) &&
    addressFieldMatches(current?.last_name, next?.last_name) &&
    addressFieldMatches(current?.email, next?.email) &&
    addressFieldMatches(current?.phone, next?.phone) &&
    addressFieldMatches(current?.address1, next?.address1) &&
    addressFieldMatches(current?.address2, next?.address2) &&
    addressFieldMatches(current?.city, next?.city) &&
    addressFieldMatches(current?.state, next?.state) &&
    addressFieldMatches(current?.zip, next?.zip) &&
    addressFieldMatches(current?.country, next?.country)
  );
}

export function getSwellManualPaymentMethod(
  paymentMethod?: SwellCheckoutPaymentMethod,
) {
  if (paymentMethod === "crypto") return SWELL_CRYPTO_PAYMENT_METHOD;
  if (paymentMethod === "card" || paymentMethod === "square") return SWELL_CARD_DEBIT_PAYMENT_METHOD;
  if (paymentMethod === "interac") return SWELL_INTERAC_PAYMENT_METHOD;
  return SWELL_MANUAL_PAYMENT_METHOD;
}

const CHECKOUT_SWELL_TIMEOUT_MS = null;

export function toSwellAddress(address: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}) {
  return {
    name: buildName(address.firstName, address.lastName),
    first_name: address.firstName,
    last_name: address.lastName,
    email: address.email,
    phone: address.phone,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    state: address.province,
    zip: address.postalCode,
    country: address.country,
  } satisfies SwellBackendAddress;
}

export async function findSwellAccountByEmail(email: string) {
  const response = await swellBackendRequest<{
    results?: SwellBackendAccount[];
  }>("GET", "/accounts", {
    params: {
      where: {
        email: email.trim().toLowerCase(),
      },
      limit: 1,
      page: 1,
    },
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });

  return response?.results?.[0] ?? null;
}

export async function upsertSwellGuestAccount(args: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  shipping: SwellBackendAddress;
  billing: SwellBackendAddress & { method?: string };
}) {
  const existing = await findSwellAccountByEmail(args.email);
  const payload = {
    email: args.email.trim().toLowerCase(),
    first_name: args.firstName,
    last_name: args.lastName,
    name: buildName(args.firstName, args.lastName),
    phone: args.phone,
    shipping: args.shipping,
    billing: args.billing,
  };

  if (existing) {
    const billingMatches =
      addressesMatch(existing.billing, args.billing) &&
      addressFieldMatches(existing.billing?.method, args.billing.method);
    const isUnchanged =
      addressFieldMatches(existing.email, payload.email) &&
      addressFieldMatches(existing.first_name, payload.first_name) &&
      addressFieldMatches(existing.last_name, payload.last_name) &&
      addressFieldMatches(existing.phone, payload.phone) &&
      addressesMatch(existing.shipping, args.shipping) &&
      billingMatches;

    if (isUnchanged) {
      return existing;
    }

    return swellBackendRequest<SwellBackendAccount>(
      "PUT",
      `/accounts/${existing.id}`,
      {
        body: payload,
        timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
      },
    );
  }

  return swellBackendRequest<SwellBackendAccount>("POST", "/accounts", {
    body: payload,
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });
}

async function resolveSwellItemsFromStorefrontCart(cart: StorefrontCart) {
  const items = await Promise.all(
    cart.lines.edges.map(async (edge) => {
      const line = edge.node;
      const parsedIds = extractBackendIdsFromMerchandiseId(line.merchandise.id);
      if (parsedIds) {
        return {
          product_id: parsedIds.productId,
          variant_id: parsedIds.variantId,
          quantity: line.quantity,
        } satisfies SwellBackendCartItem;
      }

      const product = await getSwellProduct(
        line.merchandise.product.handle,
        cart.cost.totalAmount.currencyCode,
      );

      if (!product) {
        return null;
      }

      const backendProductId = extractBackendProductId(product.id);
      if (!backendProductId) {
        return null;
      }

      return {
        product_id: backendProductId,
        quantity: line.quantity,
      } satisfies SwellBackendCartItem;
    }),
  );

  return items.filter((item): item is SwellBackendCartItem => item !== null);
}

async function resolveSwellItemsFromCartSnapshot(
  snapshot: StorefrontCartSnapshot,
) {
  const items = await Promise.all(
    snapshot.lines.map(async (line) => {
      const parsedIds = extractBackendIdsFromMerchandiseId(line.merchandiseId);
      if (parsedIds) {
        return {
          product_id: parsedIds.productId,
          variant_id: parsedIds.variantId,
          quantity: line.quantity,
        } satisfies SwellBackendCartItem;
      }

      const product = await getSwellProduct(
        line.productHandle,
        snapshot.currencyCode,
      );

      if (!product) {
        return null;
      }

      const backendProductId = extractBackendProductId(product.id);
      if (!backendProductId) {
        return null;
      }

      return {
        product_id: backendProductId,
        quantity: line.quantity,
      } satisfies SwellBackendCartItem;
    }),
  );

  return items.filter((item): item is SwellBackendCartItem => item !== null);
}

export async function buildSwellCheckoutDraft(args: {
  storefrontCartId?: string;
  storefrontCartSnapshot?: StorefrontCartSnapshot;
  currencyCode?: string;
  shipping: SwellBackendAddress;
  billing: SwellBackendAddress & { method?: string };
  comments?: string;
  couponCode?: string;
}) {
  let currencyCode = args.currencyCode || args.storefrontCartSnapshot?.currencyCode;
  let items: SwellBackendCartItem[] = [];

  if (args.storefrontCartSnapshot?.lines.length) {
    items = await resolveSwellItemsFromCartSnapshot(
      args.storefrontCartSnapshot,
    );
  } else if (args.storefrontCartId) {
    const storefrontCart = await getLocalCart(
      args.storefrontCartId,
      args.currencyCode,
    );

    if (!storefrontCart || storefrontCart.lines.edges.length === 0) {
      throw new Error("Cart is empty.");
    }

    currencyCode = args.currencyCode || storefrontCart.cost.totalAmount.currencyCode;
    items = await resolveSwellItemsFromStorefrontCart(storefrontCart);
  } else {
    throw new Error("Cart is empty.");
  }

  if (items.length === 0) {
    throw new Error("Unable to resolve Swell product IDs for this cart.");
  }

  return {
    currency: currencyCode || args.currencyCode || "USD",
    items,
    shipping: args.shipping,
    billing: args.billing,
    comments: args.comments,
    coupon_code: args.couponCode,
    checkout_url: "/checkout",
    guest: true,
  };
}

export async function createSwellCheckoutCart(args: {
  accountId: string;
  storefrontCartId?: string;
  storefrontCartSnapshot?: StorefrontCartSnapshot;
  currencyCode?: string;
  shipping: SwellBackendAddress;
  billing: SwellBackendAddress & { method?: string };
  comments?: string;
  couponCode?: string;
}) {
  const draft = await buildSwellCheckoutDraft({
    storefrontCartId: args.storefrontCartId,
    storefrontCartSnapshot: args.storefrontCartSnapshot,
    currencyCode: args.currencyCode,
    shipping: args.shipping,
    billing: args.billing,
    comments: args.comments,
    couponCode: args.couponCode,
  });

  const cart = await swellBackendRequest<SwellBackendCart>("POST", "/carts", {
    body: {
      ...draft,
      account_id: args.accountId,
    },
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });

  if (!cart?.id) {
    throw new Error(
      args.couponCode
        ? "Swell returned a coupon cart response without an id."
        : "Swell returned a cart response without an id.",
    );
  }

  return cart;
}

export async function updateSwellCheckoutCart(
  cartId: string,
  body: Record<string, unknown>,
) {
  return swellBackendRequest<SwellBackendCart>("PUT", `/carts/${cartId}`, {
    body,
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });
}

export async function deleteSwellCheckoutCart(cartId: string) {
  if (!cartId) {
    console.warn(
      "Skipping Swell cart deletion because no cart id was provided.",
    );
    return;
  }

  try {
    await swellBackendRequest("DELETE", `/carts/${cartId}`, {
      timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
    });
  } catch (error) {
    console.warn(`Unable to delete temporary Swell cart ${cartId}:`, error);
  }
}

export async function convertSwellCartToOrder(cartId: string) {
  return swellBackendRequest<SwellBackendOrder>("POST", "/orders", {
    body: {
      cart_id: cartId,
      // Suppress Swell's built-in emails — all emails sent via Loops.
      $notify: false,
    },
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });
}

export async function updateSwellOrder(
  orderId: string,
  body: Record<string, unknown>,
) {
  const payload = Object.prototype.hasOwnProperty.call(body, '$notify')
    ? body
    : {
        ...body,
        // Suppress Swell's built-in emails unless a caller explicitly opts in.
        $notify: false,
      };

  return swellBackendRequest<SwellBackendOrder>("PUT", `/orders/${orderId}`, {
    body: payload,
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });
}

export async function cancelSwellOrder(orderId: string, reason?: string) {
  try {
    const cancelReason = reason || "Payment provider setup failed.";
    const order = await getSwellOrder(orderId);
    const cancellationItems = (order.items || [])
      .map((item) => ({
        id: item.id,
        quantity_canceled: Number(item.quantity_cancelable ?? 0),
        cancel_reason: cancelReason,
      }))
      .filter((item) => item.quantity_canceled > 0);

    await swellBackendRequest<SwellBackendOrder>("PUT", `/orders/${orderId}`, {
      body: {
        ...(cancellationItems.length > 0 ? { items: cancellationItems } : {}),
        canceled: true,
        cancel_reason: cancelReason,
        coupon_code: null,
        coupon_id: null,
        discounts: [],
        discount_total: 0,
        item_discount: 0,
        shipping: {
          ...(order.shipping || {}),
          price: 0,
        },
        shipment_total: 0,
        // Suppress Swell's built-in emails — all emails sent via Loops.
        $notify: false,
        metadata: {
          ...(order.metadata || {}),
          cancel_reason: cancelReason,
        },
      },
    });

    await swellBackendRequest<SwellBackendOrder>("PUT", `/orders/${orderId}`, {
      body: {
        coupon_code: null,
        coupon_id: null,
        discounts: [],
        discount_total: 0,
        item_discount: 0,
        grand_total: 0,
        shipment_total: 0,
        $notify: false,
        metadata: {
          ...(order.metadata || {}),
          cancel_reason: cancelReason,
        },
      },
    }).catch((cleanupError) => {
      console.warn(
        `Unable to clear canceled Swell order discounts for ${orderId}:`,
        cleanupError,
      );
    });
  } catch (error) {
    console.error(`Failed to cancel Swell order ${orderId}:`, error);
    throw error;
  }
}

export async function createSwellOrderPayment(body: {
  account_id: string;
  order_id: string;
  amount: number;
  currency: string;
  method: string;
  transaction_id: string;
  authorized?: boolean;
  captured?: boolean;
}) {
  return swellBackendRequest<SwellBackendPayment>("POST", "/payments", {
    body: {
      ...body,
      // Suppress Swell's built-in order emails — all transactional emails
      // (confirmation, shipped, etc.) are sent via Loops instead.
      $notify: false,
    },
    timeoutMs: CHECKOUT_SWELL_TIMEOUT_MS,
  });
}

export async function createSwellCoupon(args: {
  code: string;
  name: string;
  percentOff: number;
  expiresAt: string;
  description?: string;
}) {
  return swellBackendRequest<SwellBackendCoupon>("POST", "/coupons", {
    body: buildSwellCouponCreatePayload({
      code: args.code,
      name: args.name,
      percentOff: args.percentOff,
      expiresAt: args.expiresAt,
      description: args.description,
      limitUses: 1,
      limitAccountUses: 1,
    }),
  });
}

function extractCouponCodeValue(entry: string | { code?: string } | undefined) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.code || "";
}

export async function listSwellCouponCodes(
  args: {
    search?: string;
    parentId?: string;
    limit?: number;
  } = {},
) {
  const response = await swellBackendRequest<{
    results?: SwellBackendCouponCode[];
  }>("GET", "/coupons:codes", {
    params: {
      search: args.search,
      limit: args.limit ?? 50,
      where: args.parentId ? { parent_id: args.parentId } : undefined,
    },
  });

  return response?.results || [];
}

export async function findSwellCouponCodeByCode(code: string) {
  const normalizedCode = normalizeSwellCouponCode(code);
  const codes = await listSwellCouponCodes({
    search: normalizedCode,
    limit: 25,
  });

  return (
    codes.find(
      (entry) =>
        extractCouponCodeValue(entry.code).toUpperCase() === normalizedCode,
    ) || null
  );
}

export async function createSwellCouponCode(parentId: string, code: string) {
  return swellBackendRequest<SwellBackendCouponCode>("POST", "/coupons:codes", {
    body: {
      parent_id: parentId,
      code: normalizeSwellCouponCode(code),
    },
  });
}

export async function updateSwellCouponCode(codeId: string, code: string) {
  return swellBackendRequest<SwellBackendCouponCode>(
    "PUT",
    `/coupons:codes/${codeId}`,
    {
      body: {
        code: normalizeSwellCouponCode(code),
      },
    },
  );
}

export async function updateSwellCoupon(
  couponId: string,
  body: Record<string, unknown>,
) {
  return swellBackendRequest<SwellBackendCoupon>(
    "PUT",
    `/coupons/${couponId}`,
    {
      body,
    },
  );
}

export async function getSwellCoupon(couponId: string) {
  return swellBackendRequest<SwellBackendCoupon>("GET", `/coupons/${couponId}`);
}

export async function deleteSwellCoupon(couponId: string) {
  await swellBackendRequest("DELETE", `/coupons/${couponId}`);
}

export async function setSwellCouponActive(couponId: string, active: boolean) {
  return updateSwellCoupon(couponId, { active });
}

export async function createSwellAffiliateCoupon(args: {
  code: string;
  name: string;
  percentOff: number;
  description?: string;
  active?: boolean;
}) {
  return swellBackendRequest<SwellBackendCoupon>("POST", "/coupons", {
    body: buildSwellCouponCreatePayload({
      code: args.code,
      name: args.name,
      percentOff: args.percentOff,
      description: args.description,
      active: args.active,
    }),
  });
}

export async function updateSwellAffiliateCoupon(args: {
  couponId: string;
  name: string;
  percentOff: number;
  description?: string;
  active?: boolean;
}) {
  return updateSwellCoupon(args.couponId, {
    name: args.name,
    description: args.description,
    active: args.active ?? true,
    discounts: [
      {
        type: "total",
        value_type: "percent",
        value_percent: args.percentOff,
      },
    ],
  });
}

export async function getSwellOrder(
  orderId: string,
  params?: Record<string, QueryValue>,
) {
  return swellBackendRequest<SwellBackendOrder>("GET", `/orders/${orderId}`, {
    params,
  });
}

export async function createSwellShipment(body: {
  order_id: string;
  tracking_code?: string;
  carrier_name?: string;
  service_name?: string;
  items?: Array<{
    order_item_id?: string;
    product_id?: string;
    quantity?: number;
  }>;
}) {
  return swellBackendRequest<SwellBackendShipment>("POST", "/shipments", {
    body: {
      ...body,
      // Suppress Swell's built-in emails — all emails sent via Loops.
      $notify: false,
    },
  });
}
