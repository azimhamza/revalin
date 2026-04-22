import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

type CheckoutOrderLine = {
  id: string;
  merchandiseId: string;
  productHandle: string;
  productTitle: string;
  variantTitle: string;
  skuNumber?: string;
  quantity: number;
  unitPrice: {
    amount: string;
    currencyCode: string;
  };
  lineTotal: {
    amount: string;
    currencyCode: string;
  };
};

type OrderRow = {
  order_id: string;
  email: string | null;
  currency_code: string;
  shipping_address: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
  totals: {
    subtotalAmount: { amount: string; currencyCode: string };
    shippingAmount?: { amount: string; currencyCode: string };
    taxAmount?: { amount: string; currencyCode: string };
    discountAmount?: { amount: string; currencyCode: string };
    totalAmount: { amount: string; currencyCode: string };
  };
  swell: {
    orderId: string;
    orderNumber?: string;
  };
  lines: CheckoutOrderLine[];
  payment: {
    __processing?: {
      confirmationEmail?: {
        status?: string;
        startedAt?: string;
        completedAt?: string;
        attempts?: number;
        lastError?: string | null;
        claimId?: string | null;
      };
    };
  };
};

type SwellProduct = {
  id?: string;
  slug?: string;
  sku?: string;
  variants?: {
    results?: Array<{
      id?: string;
      sku?: string;
    }>;
  };
};

function parseJsonValue<T>(value: T | string): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const SWELL_STORE_ID = process.env.SWELL_STORE_ID?.trim();
const SWELL_SECRET_KEY = process.env.SWELL_SECRET_KEY?.trim();
const LOOPS_API_KEY = process.env.LOOPS_API_KEY?.trim();
const LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION =
  process.env.LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION?.trim();

if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL.');
}

if (!SWELL_STORE_ID || !SWELL_SECRET_KEY) {
  throw new Error('Missing Swell credentials.');
}

if (!LOOPS_API_KEY || !LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION) {
  throw new Error('Missing Loops transactional email configuration.');
}

const SWELL_STORE_ID_SAFE = SWELL_STORE_ID!;
const SWELL_SECRET_KEY_SAFE = SWELL_SECRET_KEY!;
const LOOPS_API_KEY_SAFE = LOOPS_API_KEY!;
const LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION_SAFE =
  LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION!;

const sql = postgres(DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
});

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function formatRegionName(regionCode: string) {
  const normalized = regionCode.trim().toUpperCase();
  if (!normalized) return '';

  try {
    const formatter = new Intl.DisplayNames(['en'], { type: 'region' });
    return formatter.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

function buildOrderProductName(line: CheckoutOrderLine) {
  const variantTitle = line.variantTitle.trim();
  if (
    !variantTitle ||
    variantTitle.toLowerCase() === 'default' ||
    variantTitle === line.productTitle
  ) {
    return line.productTitle;
  }

  return `${line.productTitle} - ${variantTitle}`;
}

function buildOrderItems(order: Pick<OrderRow, 'lines' | 'currency_code'>) {
  return order.lines.map((line) => ({
    product_name: buildOrderProductName(line),
    sku_number:
      line.skuNumber?.trim() ||
      line.productHandle?.trim() ||
      line.merchandiseId?.trim() ||
      buildOrderProductName(line),
    quantity: line.quantity,
    unit_price: formatCurrency(line.unitPrice.amount, order.currency_code),
    subtotal: formatCurrency(line.lineTotal.amount, order.currency_code),
  }));
}

function buildOrderConfirmationDataVariables(order: OrderRow) {
  const shippingAmount = order.totals.shippingAmount
    ? formatCurrency(order.totals.shippingAmount.amount, order.currency_code)
    : 'Free';
  const taxAmount = order.totals.taxAmount
    ? formatCurrency(order.totals.taxAmount.amount, order.currency_code)
    : '$0.00';
  const discountAmount =
    order.totals.discountAmount &&
    Number(order.totals.discountAmount.amount) > 0
      ? `-${formatCurrency(
          order.totals.discountAmount.amount,
          order.currency_code,
        )}`
      : '$0.00';

  return {
    items: buildOrderItems(order),
    subtotal: formatCurrency(
      order.totals.subtotalAmount.amount,
      order.currency_code,
    ),
    shipping: shippingAmount,
    shipping_total: shippingAmount,
    tax: taxAmount,
    discount: discountAmount,
    total_paid: formatCurrency(
      order.totals.totalAmount.amount,
      order.currency_code,
    ),
    customer_name:
      `${order.shipping_address.firstName} ${order.shipping_address.lastName}`.trim(),
    street_address: [
      order.shipping_address.address1,
      order.shipping_address.address2,
    ]
      .filter(Boolean)
      .join(', '),
    city: order.shipping_address.city,
    state: order.shipping_address.province,
    postal_code: order.shipping_address.postalCode,
    country: formatRegionName(order.shipping_address.country),
    order_number: order.swell.orderNumber || order.order_id,
  };
}

function parseMerchandiseId(merchandiseId: string | undefined) {
  if (!merchandiseId) return null;

  const match = merchandiseId.match(
    /^swell:product:([^:]+)(?::variant:(.+))?$/,
  );
  if (!match) return null;

  return {
    productId: decodeURIComponent(match[1]),
    variantId: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}

const productCache = new Map<string, SwellProduct>();

async function fetchSwellJson(pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(`https://api.swell.store${pathname}`);
  if (searchParams) {
    url.search = searchParams.toString();
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${SWELL_STORE_ID_SAFE}:${SWELL_SECRET_KEY_SAFE}`,
        'utf8',
      ).toString('base64')}`,
      'Swell-Store-Id': SWELL_STORE_ID_SAFE,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Swell ${response.status} for ${url.pathname}: ${text}`);
  }

  return JSON.parse(text) as SwellProduct | { results?: SwellProduct[] };
}

async function getSwellProductForLine(line: CheckoutOrderLine) {
  const parsedIds = parseMerchandiseId(line.merchandiseId);
  if (parsedIds?.productId) {
    const cacheKey = `id:${parsedIds.productId}`;
    const cached = productCache.get(cacheKey);
    if (cached) return { product: cached, variantId: parsedIds.variantId };

    const product = (await fetchSwellJson(
      `/products/${encodeURIComponent(parsedIds.productId)}`,
      new URLSearchParams({ expand: 'variants' }),
    )) as SwellProduct;

    productCache.set(cacheKey, product);
    return { product, variantId: parsedIds.variantId };
  }

  const handle = line.productHandle?.trim();
  if (!handle) return { product: null, variantId: undefined };

  const cacheKey = `handle:${handle}`;
  const cached = productCache.get(cacheKey);
  if (cached) return { product: cached, variantId: undefined };

  const searchParams = new URLSearchParams({
    limit: '1',
    page: '1',
    expand: 'variants',
  });
  searchParams.set('where[slug]', handle);

  const response = (await fetchSwellJson(
    '/products',
    searchParams,
  )) as { results?: SwellProduct[] };
  const product = response.results?.[0] || null;
  if (product) {
    productCache.set(cacheKey, product);
  }

  return { product, variantId: undefined };
}

async function resolveSku(line: CheckoutOrderLine) {
  const currentSku = line.skuNumber?.trim();
  if (currentSku) {
    return currentSku;
  }

  const { product, variantId } = await getSwellProductForLine(line);
  if (!product) {
    return undefined;
  }

  if (variantId) {
    const variantSku = product.variants?.results?.find(
      (variant) => String(variant.id || '') === variantId,
    )?.sku;
    if (variantSku?.trim()) {
      return variantSku.trim();
    }
  }

  const productSku = product.sku?.trim();
  if (productSku) {
    return productSku;
  }

  return undefined;
}

async function sendLoopsConfirmation(order: OrderRow) {
  const response = await fetch('https://app.loops.so/api/v1/transactional', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOOPS_API_KEY_SAFE}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `order-confirmation-${order.order_id}`,
    },
    body: JSON.stringify({
      transactionalId: LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION_SAFE,
      email: order.email,
      addToAudience: true,
      dataVariables: buildOrderConfirmationDataVariables(order),
    }),
  });

  const text = await response.text();
  if (response.status === 409) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      message = parsed.message || text;
    } catch {
      // Keep raw text when response isn't JSON.
    }

    if (/idempotency key .* already been processed/i.test(message)) {
      return;
    }
  }

  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      message = parsed.message || text;
    } catch {
      // Keep raw text when response isn't JSON.
    }

    throw new Error(`${response.status} - ${message}`);
  }
}

function buildUpdatedPayment(
  payment: OrderRow['payment'],
  status: 'completed' | 'failed',
  error?: string,
) {
  const now = new Date().toISOString();
  const processing = payment.__processing || {};
  const current = processing.confirmationEmail || {};

  return {
    ...payment,
    __processing: {
      ...processing,
      confirmationEmail: {
        ...current,
        status,
        startedAt: now,
        completedAt: now,
        attempts: Number(current.attempts || 0) + 1,
        lastError: status === 'failed' ? error || 'Unknown error' : null,
        claimId: null,
      },
    },
  };
}

async function main() {
  const rows = await sql<OrderRow[]>`
    select
      order_id,
      email,
      currency_code,
      shipping_address,
      totals,
      swell,
      lines,
      payment
    from checkout_orders
    where lower(payment_status) in ('paid', 'finished')
    order by updated_at desc
  `;

  const normalizedRows = rows.map((row) => ({
    ...row,
    lines: Array.isArray(parseJsonValue<CheckoutOrderLine[] | unknown>(row.lines))
      ? (parseJsonValue<CheckoutOrderLine[] | unknown>(row.lines) as CheckoutOrderLine[])
      : [],
    payment: parseJsonValue<OrderRow['payment']>(row.payment),
  }));

  const targetRows = normalizedRows.filter((row) => {
    const confirmationStatus =
      row.payment?.__processing?.confirmationEmail?.status || 'pending';
    const hasMissingSku = row.lines.some((line) => !line.skuNumber?.trim());

    return confirmationStatus === 'failed' || hasMissingSku;
  });

  if (targetRows.length === 0) {
    console.log('No successful orders need SKU backfill or confirmation repair.');
    return;
  }

  let sent = 0;
  let failed = 0;
  let backfilledOnly = 0;

  for (const row of targetRows) {
    if (!row.email?.trim()) {
      console.warn(`[skip] ${row.order_id} has no customer email.`);
      continue;
    }

    const updatedLines = await Promise.all(
      row.lines.map(async (line) => ({
        ...line,
        skuNumber: (await resolveSku(line)) || line.skuNumber,
      })),
    );

    const orderForEmail: OrderRow = {
      ...row,
      lines: updatedLines,
    };

    let nextPayment = row.payment;
    const shouldRetryConfirmation =
      row.payment?.__processing?.confirmationEmail?.status === 'failed';

    if (shouldRetryConfirmation) {
      try {
        await sendLoopsConfirmation(orderForEmail);
        nextPayment = buildUpdatedPayment(row.payment, 'completed');
        sent += 1;
        console.log(`[sent] ${row.order_id} -> ${row.email}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown confirmation email error';
        nextPayment = buildUpdatedPayment(row.payment, 'failed', message);
        failed += 1;
        console.error(`[failed] ${row.order_id}: ${message}`);
      }
    } else {
      backfilledOnly += 1;
      console.log(`[backfilled] ${row.order_id}`);
    }

    await sql`
      update checkout_orders
      set
        lines = ${JSON.stringify(updatedLines)}::jsonb,
        payment = ${JSON.stringify(nextPayment)}::jsonb,
        updated_at = ${new Date()}
      where order_id = ${row.order_id}
    `;
  }

  console.log(
    JSON.stringify(
      {
        total: targetRows.length,
        sent,
        failed,
        backfilledOnly,
      },
      null,
      2,
    ),
  );
}

void (async () => {
  try {
    await main();
  } finally {
    await sql.end({ timeout: 1 });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
