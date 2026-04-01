import type { CheckoutShippingAddress } from '@/lib/checkout/types';

const SHIPPO_API_BASE_URL = 'https://api.goshippo.com';
const SHIPPO_API_TOKEN = (
  process.env.SHIPPO_API_TOKEN ||
  process.env.SHIPPO_TEST_TOKEN ||
  process.env.SHIPPO_TOKEN ||
  ''
).trim();

const SHIPPO_ORIGIN = {
  name: (process.env.SHIPPO_ORIGIN_NAME || 'Revalin Fulfillment').trim(),
  email: (process.env.SHIPPO_ORIGIN_EMAIL || '').trim(),
  phone: (process.env.SHIPPO_ORIGIN_PHONE || '').trim(),
  street1: (process.env.SHIPPO_ORIGIN_STREET1 || '').trim(),
  street2: (process.env.SHIPPO_ORIGIN_STREET2 || '').trim(),
  city: (process.env.SHIPPO_ORIGIN_CITY || 'Waterloo').trim(),
  state: (process.env.SHIPPO_ORIGIN_STATE || 'ON').trim(),
  zip: (process.env.SHIPPO_ORIGIN_ZIP || '').trim(),
  country: (process.env.SHIPPO_ORIGIN_COUNTRY || 'CA').trim().toUpperCase(),
} as const;

const DEFAULT_PARCEL = {
  lengthIn: Number(process.env.SHIPPO_PARCEL_LENGTH_IN || 3),
  widthIn: Number(process.env.SHIPPO_PARCEL_WIDTH_IN || 3),
  heightIn: Number(process.env.SHIPPO_PARCEL_HEIGHT_IN || 1),
  weightOz: Number(process.env.SHIPPO_DEFAULT_ITEM_WEIGHT_OZ || 2),
} as const;

type ShippoRate = {
  object_id?: string;
  amount?: string;
  currency?: string;
  amount_local?: string;
  currency_local?: string;
  provider?: string;
  estimated_days?: number | null;
  servicelevel?: {
    token?: string;
    name?: string;
  };
};

type ShippoShipmentResponse = {
  object_id?: string;
  rates?: ShippoRate[];
  messages?: Array<{
    code?: string;
    text?: string;
    source?: string;
  }>;
};

export type ShippoCheckoutRate = {
  id: string;
  name: string;
  carrier?: string;
  estimatedDays?: number | null;
  price: number;
  currencyCode: string;
  source: 'shippo';
};

function normalizeRateToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveConfiguredParcel(itemCount: number) {
  const quantity = Math.max(1, itemCount);
  const lengthIn = parsePositiveNumber(DEFAULT_PARCEL.lengthIn) || 3;
  const widthIn = parsePositiveNumber(DEFAULT_PARCEL.widthIn) || 3;
  const baseHeightIn = parsePositiveNumber(DEFAULT_PARCEL.heightIn) || 1;
  const baseWeightOz = parsePositiveNumber(DEFAULT_PARCEL.weightOz) || 2;

  return {
    length: lengthIn.toFixed(2),
    width: widthIn.toFixed(2),
    height: (baseHeightIn * Math.max(1, Math.ceil(quantity / 2))).toFixed(2),
    distance_unit: 'in',
    weight: (baseWeightOz * quantity).toFixed(2),
    mass_unit: 'oz',
  } as const;
}

function chooseRateAmount(rate: ShippoRate, currencyCode: string) {
  const normalizedCurrencyCode = currencyCode.toUpperCase();

  if (rate.currency?.toUpperCase() === normalizedCurrencyCode && rate.amount) {
    return {
      amount: Number(rate.amount),
      currencyCode: normalizedCurrencyCode,
    };
  }

  if (rate.currency_local?.toUpperCase() === normalizedCurrencyCode && rate.amount_local) {
    return {
      amount: Number(rate.amount_local),
      currencyCode: normalizedCurrencyCode,
    };
  }

  return null;
}

function mapShippoRate(rate: ShippoRate, currencyCode: string): ShippoCheckoutRate | null {
  const resolvedAmount = chooseRateAmount(rate, currencyCode);

  if (!resolvedAmount || !Number.isFinite(resolvedAmount.amount)) {
    return null;
  }

  const provider = rate.provider?.trim() || 'Shippo';
  const serviceToken = rate.servicelevel?.token?.trim() || rate.servicelevel?.name?.trim() || rate.object_id?.trim();

  if (!serviceToken) {
    return null;
  }

  return {
    id: `shippo:${normalizeRateToken(provider)}:${normalizeRateToken(serviceToken)}`,
    name: rate.servicelevel?.name?.trim() || provider,
    carrier: provider,
    estimatedDays: rate.estimated_days ?? null,
    price: resolvedAmount.amount,
    currencyCode: resolvedAmount.currencyCode,
    source: 'shippo',
  };
}

export function getShippoConfigStatus() {
  return {
    hasToken: Boolean(SHIPPO_API_TOKEN),
    hasOriginStreet1: Boolean(SHIPPO_ORIGIN.street1),
    hasOriginZip: Boolean(SHIPPO_ORIGIN.zip),
  } as const;
}

export function isShippoConfigured() {
  const status = getShippoConfigStatus();
  return status.hasToken && status.hasOriginStreet1 && status.hasOriginZip;
}

export async function quoteShippoRates(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  currencyCode: string;
}) {
  if (!isShippoConfigured()) {
    return null;
  }

  const response = await fetch(`${SHIPPO_API_BASE_URL}/shipments/`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${SHIPPO_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      address_from: {
        name: SHIPPO_ORIGIN.name,
        email: SHIPPO_ORIGIN.email || undefined,
        phone: SHIPPO_ORIGIN.phone || undefined,
        street1: SHIPPO_ORIGIN.street1,
        street2: SHIPPO_ORIGIN.street2 || undefined,
        city: SHIPPO_ORIGIN.city,
        state: SHIPPO_ORIGIN.state,
        zip: SHIPPO_ORIGIN.zip,
        country: SHIPPO_ORIGIN.country,
        validate: false,
      },
      address_to: {
        name: `${args.shippingAddress.firstName} ${args.shippingAddress.lastName}`.trim(),
        email: args.shippingAddress.email,
        phone: args.shippingAddress.phone,
        street1: args.shippingAddress.address1,
        street2: args.shippingAddress.address2 || undefined,
        city: args.shippingAddress.city,
        state: args.shippingAddress.province,
        zip: args.shippingAddress.postalCode,
        country: args.shippingAddress.country,
        validate: false,
      },
      parcels: [resolveConfiguredParcel(args.itemCount)],
      async: false,
    }),
  });

  const payload = (await response.json()) as ShippoShipmentResponse;

  if (!response.ok) {
    const message =
      payload.messages?.map(entry => entry.text || entry.code).filter(Boolean).join(', ') || response.statusText;
    throw new Error(`Shippo rate request failed: ${message}`);
  }

  const services = (payload.rates || [])
    .map(rate => mapShippoRate(rate, args.currencyCode))
    .filter((rate): rate is ShippoCheckoutRate => rate !== null);

  return services;
}
