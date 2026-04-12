import { providerFetch } from '../api/provider-client.ts';
import type { CheckoutShippingAddress, CheckoutShippingService } from './types.ts';

const SHIPENGINE_API_KEY = (process.env.SHIPENGINE_API_KEY || '').trim();
const SHIPENGINE_API_BASE = (process.env.SHIPENGINE_API_BASE || 'https://api.shipengine.com').trim().replace(/\/$/, '');
const SHIPENGINE_CARRIER_IDS = (process.env.SHIPENGINE_CARRIER_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const SHIPENGINE_ORIGIN = {
  name: (process.env.SHIPENGINE_ORIGIN_NAME || 'Revalin Fulfillment').trim(),
  phone: (process.env.SHIPENGINE_ORIGIN_PHONE || '').trim(),
  street1: (process.env.SHIPENGINE_ORIGIN_STREET1 || '').trim(),
  street2: (process.env.SHIPENGINE_ORIGIN_STREET2 || '').trim(),
  city: (process.env.SHIPENGINE_ORIGIN_CITY || 'Waterloo').trim(),
  state: (process.env.SHIPENGINE_ORIGIN_STATE || 'ON').trim(),
  zip: (process.env.SHIPENGINE_ORIGIN_ZIP || '').trim(),
  country: (process.env.SHIPENGINE_ORIGIN_COUNTRY || 'CA').trim().toUpperCase(),
} as const;

const DEFAULT_PARCEL = {
  lengthIn: Number(process.env.SHIPENGINE_PARCEL_LENGTH_IN || 3),
  widthIn: Number(process.env.SHIPENGINE_PARCEL_WIDTH_IN || 3),
  heightIn: Number(process.env.SHIPENGINE_PARCEL_HEIGHT_IN || 1),
  weightOz: Number(process.env.SHIPENGINE_DEFAULT_ITEM_WEIGHT_OZ || 2),
} as const;

type ShipEngineApiError = {
  error_source?: string;
  error_type?: string;
  error_code?: string;
  message?: string;
};

type ShipEngineCarrierResponse = {
  carriers?: Array<{
    carrier_id?: string;
    send_rates?: boolean;
  }>;
  errors?: ShipEngineApiError[];
};

type ShipEngineRateApiResponse = {
  rate_response?: {
    rates?: Array<{
      rate_id?: string;
      carrier_id?: string;
      carrier_code?: string;
      carrier_friendly_name?: string;
      service_type?: string;
      service_code?: string;
      shipping_amount?: {
        amount?: number;
        currency?: string;
      };
      delivery_days?: number | null;
      error_messages?: string[];
    }>;
    errors?: ShipEngineApiError[];
  };
  errors?: ShipEngineApiError[];
};

export type ShipEnginePurchasableRate = NonNullable<
  NonNullable<ShipEngineRateApiResponse['rate_response']>['rates']
>[number];

type ShipEngineLabelResponse = {
  tracking_number?: string;
  carrier_code?: string;
  service_code?: string;
  label_download?: {
    href?: string;
    pdf?: string;
  };
  errors?: ShipEngineApiError[];
};

export type ShipEngineCheckoutRate = {
  id: string;
  name: string;
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  estimatedDays?: number | null;
  price: number;
  currencyCode: string;
  source: 'shipengine';
  shipengineRateId: string;
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

function buildShipEngineErrorMessage(errors: ShipEngineApiError[] | undefined, fallback: string) {
  const messages = (errors || [])
    .map(error => error.message?.trim())
    .filter((message): message is string => Boolean(message));

  return messages[0] || fallback;
}

function selectLowestPricedRate<
  T extends {
    shipping_amount?: {
      amount?: number;
    };
  },
>(rates: T[]) {
  return rates.reduce((lowest, current) => {
    const currentPrice = Number(current.shipping_amount?.amount ?? Infinity);
    const lowestPrice = Number(lowest.shipping_amount?.amount ?? Infinity);
    return currentPrice < lowestPrice ? current : lowest;
  }, rates[0]!);
}

export function selectShipEngineRateForService(args: {
  rates: ShipEnginePurchasableRate[];
  selectedShippingService: CheckoutShippingService;
}) {
  if (args.selectedShippingService.source !== 'shipengine') {
    throw new Error(
      'Manual review required: the selected checkout shipping service was not sourced from ShipEngine.'
    );
  }

  if (
    !args.selectedShippingService.carrierCode ||
    !args.selectedShippingService.serviceCode
  ) {
    throw new Error(
      'Manual review required: the selected ShipEngine checkout service is missing carrier/service identity.'
    );
  }

  const matchingRates = args.rates.filter(
    rate =>
      rate.rate_id &&
      rate.carrier_code === args.selectedShippingService.carrierCode &&
      rate.service_code === args.selectedShippingService.serviceCode
  );

  if (matchingRates.length === 0) {
    throw new Error(
      `Manual review required: the selected shipping service (${args.selectedShippingService.carrier || 'ShipEngine'} ${args.selectedShippingService.name}) is no longer available for label purchase.`
    );
  }

  return selectLowestPricedRate(matchingRates);
}

function buildShipmentPayload(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
}) {
  const parcel = resolveConfiguredParcel(args.itemCount);
  const originPhone = SHIPENGINE_ORIGIN.phone || args.shippingAddress.phone;

  return {
    validate_address: 'validate_and_clean',
    ship_to: {
      name: `${args.shippingAddress.firstName} ${args.shippingAddress.lastName}`.trim(),
      phone: args.shippingAddress.phone || undefined,
      address_line1: args.shippingAddress.address1,
      address_line2: args.shippingAddress.address2 || undefined,
      city_locality: args.shippingAddress.city,
      state_province: args.shippingAddress.province || undefined,
      postal_code: args.shippingAddress.postalCode,
      country_code: args.shippingAddress.country,
      address_residential_indicator: 'no',
    },
    ship_from: {
      name: SHIPENGINE_ORIGIN.name,
      // ShipStation requires a non-empty sender phone for rate requests.
      // Fall back to the checkout phone in sandbox/local setups until a dedicated origin phone is configured.
      phone: originPhone,
      address_line1: SHIPENGINE_ORIGIN.street1,
      address_line2: SHIPENGINE_ORIGIN.street2 || undefined,
      city_locality: SHIPENGINE_ORIGIN.city,
      state_province: SHIPENGINE_ORIGIN.state,
      postal_code: SHIPENGINE_ORIGIN.zip,
      country_code: SHIPENGINE_ORIGIN.country,
      address_residential_indicator: 'no',
    },
    packages: [
      {
        package_code: 'package',
        weight: {
          value: parcel.weight,
          unit: 'ounce',
        },
        dimensions: {
          length: parcel.length,
          width: parcel.width,
          height: parcel.height,
          unit: 'inch',
        },
      },
    ],
  };
}

async function shipEngineRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await providerFetch(`${SHIPENGINE_API_BASE}${path}`, {
    provider: 'shipengine',
    operation: path,
    timeoutMs: path === '/v1/rates' ? null : undefined,
    ...init,
    headers: {
      'API-Key': SHIPENGINE_API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const text = (await response.text()).trim();
  const payload = text ? JSON.parse(text) as T : null;

  if (!response.ok) {
    const errorMessage = buildShipEngineErrorMessage(
      (payload as { errors?: ShipEngineApiError[] } | null)?.errors,
      `ShipEngine request failed with status ${response.status}.`
    );
    throw new Error(errorMessage);
  }

  return payload as T;
}

let discoveredCarrierIdsPromise: Promise<string[]> | null = null;

async function getShipEngineCarrierIds() {
  if (SHIPENGINE_CARRIER_IDS.length > 0) {
    return SHIPENGINE_CARRIER_IDS;
  }

  if (!SHIPENGINE_API_KEY) {
    return [];
  }

  if (!discoveredCarrierIdsPromise) {
    discoveredCarrierIdsPromise = shipEngineRequest<ShipEngineCarrierResponse>('/v2/carriers', {
      method: 'GET',
    }).then(response =>
      (response.carriers || [])
        .filter(carrier => carrier.send_rates !== false)
        .map(carrier => carrier.carrier_id || '')
        .filter((carrierId): carrierId is string => Boolean(carrierId))
    );
  }

  return discoveredCarrierIdsPromise;
}

export function resolveConfiguredParcel(itemCount: number) {
  const quantity = Math.max(1, itemCount);
  const lengthIn = parsePositiveNumber(DEFAULT_PARCEL.lengthIn) || 3;
  const widthIn = parsePositiveNumber(DEFAULT_PARCEL.widthIn) || 3;
  const baseHeightIn = parsePositiveNumber(DEFAULT_PARCEL.heightIn) || 1;
  const baseWeightOz = parsePositiveNumber(DEFAULT_PARCEL.weightOz) || 2;

  return {
    length: lengthIn,
    width: widthIn,
    height: baseHeightIn * Math.max(1, Math.ceil(quantity / 2)),
    weight: baseWeightOz * quantity,
  };
}

export function isShipEngineConfigured() {
  return Boolean(SHIPENGINE_API_KEY && SHIPENGINE_ORIGIN.street1 && SHIPENGINE_ORIGIN.zip);
}

export function getShipEngineMissingConfig() {
  const missing: string[] = [];

  if (!SHIPENGINE_API_KEY) missing.push('SHIPENGINE_API_KEY');
  if (!SHIPENGINE_ORIGIN.street1) missing.push('SHIPENGINE_ORIGIN_STREET1');
  if (!SHIPENGINE_ORIGIN.zip) missing.push('SHIPENGINE_ORIGIN_ZIP');

  return missing;
}

export async function quoteShipEngineRates(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  currencyCode: string;
}) {
  if (!isShipEngineConfigured()) {
    return null;
  }

  const carrierIds = await getShipEngineCarrierIds();
  if (carrierIds.length === 0) {
    return null;
  }

  const result = await shipEngineRequest<ShipEngineRateApiResponse>('/v1/rates', {
    method: 'POST',
    body: JSON.stringify({
      rate_options: {
        carrier_ids: carrierIds,
      },
      shipment: buildShipmentPayload({
        shippingAddress: args.shippingAddress,
        itemCount: args.itemCount,
      }),
    }),
  });

  const allRates = result.rate_response?.rates || [];

  const rates: ShipEngineCheckoutRate[] = allRates
    .map((rate): ShipEngineCheckoutRate | null => {
      const price = Number(rate.shipping_amount?.amount);
      if (!Number.isFinite(price) || price <= 0) return null;
      if (!rate.rate_id) return null;

      const carrier = rate.carrier_friendly_name?.trim() || rate.carrier_code || 'ShipEngine';
      const service = rate.service_type?.trim() || rate.service_code || rate.rate_id;

      return {
        id: `shipengine:${normalizeRateToken(carrier)}:${normalizeRateToken(service)}`,
        name: service,
        carrier,
        carrierCode: rate.carrier_code || undefined,
        serviceCode: rate.service_code || undefined,
        estimatedDays: rate.delivery_days ?? null,
        price,
        currencyCode: (rate.shipping_amount?.currency || args.currencyCode).toUpperCase(),
        source: 'shipengine',
        shipengineRateId: rate.rate_id,
      };
    })
    .filter((rate): rate is ShipEngineCheckoutRate => rate !== null);

  return {
    rates,
  };
}

export async function purchaseShipEngineLabel(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  selectedShippingService: CheckoutShippingService;
}) {
  const carrierIds = await getShipEngineCarrierIds();
  if (!isShipEngineConfigured() || carrierIds.length === 0) {
    throw new Error('ShipEngine is not fully configured for label purchase.');
  }

  const rateResult = await shipEngineRequest<ShipEngineRateApiResponse>('/v1/rates', {
    method: 'POST',
    body: JSON.stringify({
      rate_options: {
        carrier_ids: carrierIds,
      },
      shipment: buildShipmentPayload({
        shippingAddress: args.shippingAddress,
        itemCount: args.itemCount,
      }),
    }),
  });

  const allRates = rateResult.rate_response?.rates || [];

  if (allRates.length === 0) {
    throw new Error(buildShipEngineErrorMessage(rateResult.rate_response?.errors, 'ShipEngine returned no rates for label purchase.'));
  }

  const selectedRate = selectShipEngineRateForService({
    rates: allRates,
    selectedShippingService: args.selectedShippingService,
  });

  if (!selectedRate.rate_id) {
    throw new Error('ShipEngine returned a rate without a rate_id.');
  }

  const label = await shipEngineRequest<ShipEngineLabelResponse>(`/v2/labels/rates/${selectedRate.rate_id}`, {
    method: 'POST',
    body: JSON.stringify({
      validate_address: 'validate_and_clean',
      label_layout: '4x6',
      label_format: 'pdf',
      label_download_type: 'url',
      display_scheme: 'label',
    }),
  });

  const trackingUrl = label.tracking_number
    ? `https://track.shipengine.com/${label.tracking_number}`
    : null;

  return {
    trackingCode: label.tracking_number || null,
    labelUrl: label.label_download?.pdf || label.label_download?.href || null,
    carrier: selectedRate.carrier_friendly_name || selectedRate.carrier_code || null,
    service: selectedRate.service_type || selectedRate.service_code || null,
    publicTrackingUrl: trackingUrl,
  };
}
