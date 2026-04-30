import { providerFetch } from '../api/provider-client.ts';
import type { CheckoutShippingAddress, CheckoutShippingService } from './types.ts';

const SHIPENGINE_API_KEY = (process.env.SHIPENGINE_API_KEY || '').trim();
const SHIPENGINE_API_BASE = (process.env.SHIPENGINE_API_BASE || 'https://api.shipengine.com').trim().replace(/\/$/, '');
const SHIPENGINE_CARRIER_IDS = (process.env.SHIPENGINE_CARRIER_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const SHIPENGINE_LABEL_PURCHASE_TIMEOUT_MS = Number(
  process.env.SHIPENGINE_LABEL_PURCHASE_TIMEOUT_MS || 15_000
);
const SHIPENGINE_SHIP_DATE_TIME_ZONE = (
  process.env.SHIPENGINE_SHIP_DATE_TIME_ZONE || 'America/Toronto'
)
  .trim() || 'America/Toronto';
const SHIPENGINE_CUSTOMS_DESCRIPTION = (
  process.env.SHIPENGINE_CUSTOMS_DESCRIPTION || 'Research compound'
).trim();
const SHIPENGINE_CUSTOMS_COUNTRY_OF_ORIGIN = (
  process.env.SHIPENGINE_CUSTOMS_COUNTRY_OF_ORIGIN || process.env.SHIPENGINE_ORIGIN_COUNTRY || 'CA'
)
  .trim()
  .toUpperCase();
const SHIPENGINE_CUSTOMS_HARMONIZED_TARIFF_CODE = (
  process.env.SHIPENGINE_CUSTOMS_HARMONIZED_TARIFF_CODE || ''
).trim();

const SHIPENGINE_ORIGIN = {
  name: (process.env.SHIPENGINE_ORIGIN_NAME || 'Revalin Fulfillment').trim(),
  companyName: (
    process.env.SHIPENGINE_ORIGIN_COMPANY_NAME ||
    process.env.SHIPENGINE_ORIGIN_COMPANY ||
    process.env.SHIPENGINE_ORIGIN_NAME ||
    'Revalin Fulfillment'
  ).trim(),
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
    invalid_rates?: Array<{
      carrier_code?: string;
      carrier_friendly_name?: string;
      service_code?: string;
      service_type?: string;
      error_messages?: string[];
      errors?: string[];
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

type ShipEngineTrackingResponse = {
  tracking_number?: string;
  tracking_url?: string;
  status_code?: string;
  status_description?: string;
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

function normalizeShipEngineValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeShipEngineCountryCode(value?: string | null) {
  return value?.trim().toUpperCase() || '';
}

const US_STATE_PROVINCE_CODES: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  'WASHINGTON DC': 'DC',
  'WASHINGTON D C': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'AMERICAN SAMOA': 'AS',
  GUAM: 'GU',
  'NORTHERN MARIANA ISLANDS': 'MP',
  'PUERTO RICO': 'PR',
  'US VIRGIN ISLANDS': 'VI',
  'U S VIRGIN ISLANDS': 'VI',
  'VIRGIN ISLANDS': 'VI',
  'ARMED FORCES AMERICAS': 'AA',
  'ARMED FORCES EUROPE': 'AE',
  'ARMED FORCES PACIFIC': 'AP',
};

const CANADA_STATE_PROVINCE_CODES: Record<string, string> = {
  ALBERTA: 'AB',
  'BRITISH COLUMBIA': 'BC',
  MANITOBA: 'MB',
  'NEW BRUNSWICK': 'NB',
  NEWFOUNDLAND: 'NL',
  'NEWFOUNDLAND AND LABRADOR': 'NL',
  'NORTHWEST TERRITORIES': 'NT',
  'NOVA SCOTIA': 'NS',
  NUNAVUT: 'NU',
  ONTARIO: 'ON',
  'PRINCE EDWARD ISLAND': 'PE',
  QUEBEC: 'QC',
  SASKATCHEWAN: 'SK',
  YUKON: 'YT',
  'YUKON TERRITORY': 'YT',
};

function normalizeRegionLookupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeShipEngineStateProvince(args: {
  countryCode?: string | null;
  stateProvince?: string | null;
}) {
  const normalized = normalizeShipEngineValue(args.stateProvince);
  if (!normalized) {
    return undefined;
  }

  const countryCode = args.countryCode?.trim().toUpperCase();
  if (normalized.length === 2 && /^[a-z]{2}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  const lookupKey = normalizeRegionLookupKey(normalized);
  if (countryCode === 'US') {
    return US_STATE_PROVINCE_CODES[lookupKey] || normalized;
  }
  if (countryCode === 'CA') {
    return CANADA_STATE_PROVINCE_CODES[lookupKey] || normalized;
  }

  return normalized;
}

function isInternationalShipEngineShipment(destinationCountryCode: string) {
  const originCountryCode = normalizeShipEngineCountryCode(SHIPENGINE_ORIGIN.country);
  return Boolean(
    originCountryCode &&
      destinationCountryCode &&
      originCountryCode !== destinationCountryCode
  );
}

function buildShipEngineCustoms(args: {
  destinationCountryCode: string;
  itemCount: number;
  customsValueAmount?: number;
  customsCurrencyCode?: string;
}) {
  if (!isInternationalShipEngineShipment(args.destinationCountryCode)) {
    return undefined;
  }

  const quantity = Math.max(1, Math.round(args.itemCount || 1));
  const totalValue = Number(args.customsValueAmount);
  const itemValue =
    Number.isFinite(totalValue) && totalValue > 0
      ? Math.max(0.01, totalValue / quantity)
      : 1;
  const customsItem: Record<string, unknown> = {
    description: SHIPENGINE_CUSTOMS_DESCRIPTION || 'Merchandise',
    quantity,
    value: {
      currency: (args.customsCurrencyCode || 'USD').trim().toUpperCase(),
      amount: Number(itemValue.toFixed(2)),
    },
    country_of_origin: SHIPENGINE_CUSTOMS_COUNTRY_OF_ORIGIN || 'CA',
  };

  if (SHIPENGINE_CUSTOMS_HARMONIZED_TARIFF_CODE) {
    customsItem.harmonized_tariff_code = SHIPENGINE_CUSTOMS_HARMONIZED_TARIFF_CODE;
  }

  return {
    contents: 'merchandise',
    non_delivery: 'return_to_sender',
    customs_items: [customsItem],
  };
}

function getShipEngineShipDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHIPENGINE_SHIP_DATE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function toShipEngineShipDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getShipEngineShipDate(parsed);
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

function buildShipEngineInvalidRateMessage(
  invalidRates: NonNullable<NonNullable<ShipEngineRateApiResponse['rate_response']>['invalid_rates']> | undefined,
) {
  const messages = (invalidRates || [])
    .flatMap(rate => rate.error_messages || rate.errors || [])
    .map(message => message.trim())
    .filter(Boolean);

  return messages[0] || null;
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

  const selectedCarrierCode = normalizeShipEngineValue(
    args.selectedShippingService.carrierCode
  );
  const selectedServiceCode = normalizeShipEngineValue(
    args.selectedShippingService.serviceCode
  );

  if (!selectedCarrierCode || !selectedServiceCode) {
    throw new Error(
      'Manual review required: the selected ShipEngine checkout service is missing carrier/service identity.'
    );
  }

  const matchingRates = args.rates.filter(
    rate =>
      rate.rate_id &&
      normalizeShipEngineValue(rate.carrier_code) === selectedCarrierCode &&
      normalizeShipEngineValue(rate.service_code) === selectedServiceCode
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
  customsValueAmount?: number;
  customsCurrencyCode?: string;
}) {
  const parcel = resolveConfiguredParcel(args.itemCount);
  const originPhone = SHIPENGINE_ORIGIN.phone || args.shippingAddress.phone;
  const shipToCountryCode = normalizeShipEngineCountryCode(args.shippingAddress.country);
  const customs = buildShipEngineCustoms({
    destinationCountryCode: shipToCountryCode,
    itemCount: args.itemCount,
    customsValueAmount: args.customsValueAmount,
    customsCurrencyCode: args.customsCurrencyCode,
  });

  return {
    validate_address: 'validate_and_clean',
    ship_date: getShipEngineShipDate(),
    ship_to: {
      name: `${args.shippingAddress.firstName} ${args.shippingAddress.lastName}`.trim(),
      phone: args.shippingAddress.phone || undefined,
      address_line1: args.shippingAddress.address1,
      address_line2: args.shippingAddress.address2 || undefined,
      city_locality: args.shippingAddress.city,
      state_province: normalizeShipEngineStateProvince({
        countryCode: shipToCountryCode,
        stateProvince: args.shippingAddress.province,
      }),
      postal_code: args.shippingAddress.postalCode,
      country_code: shipToCountryCode,
      address_residential_indicator: 'no',
    },
    ship_from: {
      name: SHIPENGINE_ORIGIN.name,
      company_name: SHIPENGINE_ORIGIN.companyName,
      // ShipStation requires a non-empty sender phone for rate requests.
      // Fall back to the checkout phone in sandbox/local setups until a dedicated origin phone is configured.
      phone: originPhone,
      address_line1: SHIPENGINE_ORIGIN.street1,
      address_line2: SHIPENGINE_ORIGIN.street2 || undefined,
      city_locality: SHIPENGINE_ORIGIN.city,
      state_province: normalizeShipEngineStateProvince({
        countryCode: SHIPENGINE_ORIGIN.country,
        stateProvince: SHIPENGINE_ORIGIN.state,
      }),
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
    ...(customs ? { customs } : {}),
  };
}

async function shipEngineRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await providerFetch(`${SHIPENGINE_API_BASE}${path}`, {
    provider: 'shipengine',
    operation: path,
    timeoutMs:
      path === '/v1/rates'
        ? null
        : path.startsWith('/v2/labels/rates/')
          ? SHIPENGINE_LABEL_PURCHASE_TIMEOUT_MS
          : undefined,
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

async function getShipEngineTrackingUrl(args: {
  trackingNumber?: string | null;
  carrierCode?: string | null;
  carrierId?: string | null;
}) {
  const trackingNumber = args.trackingNumber?.trim();
  if (!trackingNumber) {
    return null;
  }

  const params = new URLSearchParams({
    tracking_number: trackingNumber,
  });

  const carrierCode = args.carrierCode?.trim();
  const carrierId = args.carrierId?.trim();
  if (carrierCode) {
    params.set('carrier_code', carrierCode);
  } else if (carrierId) {
    params.set('carrier_id', carrierId);
  }

  try {
    const tracking = await shipEngineRequest<ShipEngineTrackingResponse>(
      `/v1/tracking?${params.toString()}`,
      {
        method: 'GET',
      }
    );

    return tracking.tracking_url?.trim() || null;
  } catch (error) {
    console.warn('Unable to fetch ShipEngine tracking URL after label purchase.', {
      trackingNumber,
      carrierCode: carrierCode || null,
      carrierId: carrierId || null,
      error: error instanceof Error ? error.message : 'Unknown tracking lookup error',
    });
    return null;
  }
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
  customsValueAmount?: number;
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
        customsValueAmount: args.customsValueAmount,
        customsCurrencyCode: args.currencyCode,
      }),
    }),
  });

  const allRates = result.rate_response?.rates || [];

  if (allRates.length === 0) {
    const errorMessage =
      buildShipEngineErrorMessage(result.rate_response?.errors, '') ||
      buildShipEngineInvalidRateMessage(result.rate_response?.invalid_rates);

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  const rates: ShipEngineCheckoutRate[] = allRates
    .map((rate): ShipEngineCheckoutRate | null => {
      const price = Number(rate.shipping_amount?.amount);
      if (!Number.isFinite(price) || price <= 0) return null;
      if (!rate.rate_id) return null;

      const carrier =
        rate.carrier_friendly_name?.trim() ||
        normalizeShipEngineValue(rate.carrier_code) ||
        'ShipEngine';
      const service =
        rate.service_type?.trim() ||
        normalizeShipEngineValue(rate.service_code) ||
        rate.rate_id;

      return {
        id: `shipengine:${normalizeRateToken(carrier)}:${normalizeRateToken(service)}`,
        name: service,
        carrier,
        carrierCode: normalizeShipEngineValue(rate.carrier_code),
        serviceCode: normalizeShipEngineValue(rate.service_code),
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

function buildShipEngineLabelPurchasePayload() {
  return JSON.stringify({
    validate_address: 'validate_and_clean',
    label_layout: '4x6',
    label_format: 'pdf',
    label_download_type: 'url',
    display_scheme: 'label',
  });
}

async function purchaseShipEngineLabelByRateId(rateId: string) {
  return shipEngineRequest<ShipEngineLabelResponse>(
    `/v2/labels/rates/${rateId}`,
    {
      method: 'POST',
      body: buildShipEngineLabelPurchasePayload(),
    }
  );
}

function isShipEngineTimeoutError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'provider_timeout'
  );
}

export async function purchaseShipEngineLabel(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  customsValueAmount?: number;
  customsCurrencyCode?: string;
  selectedShippingService: CheckoutShippingService;
  orderCreatedAt?: string;
}) {
  if (args.selectedShippingService.source !== 'shipengine') {
    throw new Error(
      'Manual review required: the selected checkout shipping service was not sourced from ShipEngine.'
    );
  }

  const carrierIds = await getShipEngineCarrierIds();
  if (!isShipEngineConfigured() || carrierIds.length === 0) {
    throw new Error('ShipEngine is not fully configured for label purchase.');
  }

  const savedRateId = normalizeShipEngineValue(
    args.selectedShippingService.shipengineRateId
  );
  const currentShipDate = getShipEngineShipDate();
  const orderCreatedShipDate = toShipEngineShipDate(args.orderCreatedAt);
  const shouldReuseSavedRateId =
    !savedRateId ||
    !orderCreatedShipDate ||
    orderCreatedShipDate === currentShipDate;

  if (savedRateId && shouldReuseSavedRateId) {
    try {
      const label = await purchaseShipEngineLabelByRateId(savedRateId);
      const trackingUrl = await getShipEngineTrackingUrl({
        trackingNumber: label.tracking_number,
        carrierCode:
          normalizeShipEngineValue(label.carrier_code) ||
          normalizeShipEngineValue(args.selectedShippingService.carrierCode),
      });

      return {
        trackingCode: label.tracking_number || null,
        labelUrl: label.label_download?.pdf || label.label_download?.href || null,
        carrier:
          args.selectedShippingService.carrier ||
          normalizeShipEngineValue(label.carrier_code) ||
          null,
        service:
          args.selectedShippingService.name ||
          normalizeShipEngineValue(label.service_code) ||
          null,
        publicTrackingUrl: trackingUrl,
      };
    } catch (error) {
      if (isShipEngineTimeoutError(error)) {
        throw error;
      }

      console.warn(
        'Unable to purchase ShipEngine label from the saved rate id. Falling back to a fresh rate quote.',
        {
          rateId: savedRateId,
          carrierCode:
            normalizeShipEngineValue(args.selectedShippingService.carrierCode) ||
            null,
          serviceCode:
            normalizeShipEngineValue(args.selectedShippingService.serviceCode) ||
            null,
          error: error instanceof Error ? error.message : 'Unknown label purchase error',
        }
      );
    }
  } else if (savedRateId) {
    console.info(
      'Skipping saved ShipEngine rate id because it was quoted for an older shipment date. Requesting a fresh rate instead.',
      {
        rateId: savedRateId,
        carrierCode:
          normalizeShipEngineValue(args.selectedShippingService.carrierCode) || null,
        serviceCode:
          normalizeShipEngineValue(args.selectedShippingService.serviceCode) || null,
        currentShipDate,
        quotedShipDate: orderCreatedShipDate,
      }
    );
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
        customsValueAmount: args.customsValueAmount,
        customsCurrencyCode: args.customsCurrencyCode,
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

  const label = await purchaseShipEngineLabelByRateId(selectedRate.rate_id);

  const trackingUrl = await getShipEngineTrackingUrl({
    trackingNumber: label.tracking_number,
    carrierCode:
      normalizeShipEngineValue(label.carrier_code) ||
      normalizeShipEngineValue(selectedRate.carrier_code),
    carrierId: selectedRate.carrier_id,
  });

  return {
    trackingCode: label.tracking_number || null,
    labelUrl: label.label_download?.pdf || label.label_download?.href || null,
    carrier:
      selectedRate.carrier_friendly_name?.trim() ||
      normalizeShipEngineValue(selectedRate.carrier_code) ||
      null,
    service:
      selectedRate.service_type?.trim() ||
      normalizeShipEngineValue(selectedRate.service_code) ||
      null,
    publicTrackingUrl: trackingUrl,
  };
}
