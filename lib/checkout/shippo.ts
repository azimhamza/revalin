import { providerFetch } from '@/lib/api/provider-client';
import type { CheckoutShippingAddress } from '@/lib/checkout/types';
import type { ShippoFulfillmentSettings } from './shippo-fulfillment-settings';

const SHIPPO_API_BASE_URL = (process.env.SHIPPO_API_BASE || 'https://api.goshippo.com')
  .trim()
  .replace(/\/$/, '');
const SHIPPO_API_VERSION = (process.env.SHIPPO_API_VERSION || '2018-02-08').trim();
const SHIPPO_API_TOKEN = (
  process.env.SHIPPO_API_TOKEN ||
  process.env.SHIPPO_TEST_TOKEN ||
  process.env.SHIPPO_TOKEN ||
  ''
).trim();
const SHIPPO_LABEL_FILE_TYPE = (process.env.SHIPPO_LABEL_FILE_TYPE || 'PDF_4x6').trim();

const SHIPPO_ORIGIN = {
  name: (process.env.SHIPPO_ORIGIN_NAME || '').trim(),
  email: (process.env.SHIPPO_ORIGIN_EMAIL || '').trim(),
  phone: (process.env.SHIPPO_ORIGIN_PHONE || '').trim(),
  street1: (process.env.SHIPPO_ORIGIN_STREET1 || '').trim(),
  street2: (process.env.SHIPPO_ORIGIN_STREET2 || '').trim(),
  city: (process.env.SHIPPO_ORIGIN_CITY || '').trim(),
  state: (process.env.SHIPPO_ORIGIN_STATE || '').trim(),
  zip: (process.env.SHIPPO_ORIGIN_ZIP || '').trim(),
  country: (process.env.SHIPPO_ORIGIN_COUNTRY || '').trim().toUpperCase(),
} as const;

const DEFAULT_PARCEL = {
  lengthIn: Number(process.env.SHIPPO_PARCEL_LENGTH_IN || 3),
  widthIn: Number(process.env.SHIPPO_PARCEL_WIDTH_IN || 3),
  heightIn: Number(process.env.SHIPPO_PARCEL_HEIGHT_IN || 1),
  weightOz: Number(process.env.SHIPPO_DEFAULT_ITEM_WEIGHT_OZ || 2),
} as const;

type ShippoMessage = {
  code?: string;
  text?: string;
  source?: string;
};

type ShippoRate = {
  object_id?: string;
  amount?: string;
  currency?: string;
  amount_local?: string;
  currency_local?: string;
  provider?: string;
  carrier_account?: string;
  estimated_days?: number | null;
  duration_terms?: string | null;
  servicelevel?: {
    token?: string;
    name?: string;
  };
  messages?: ShippoMessage[];
};

type ShippoShipmentResponse = {
  object_id?: string;
  rates?: ShippoRate[];
  messages?: ShippoMessage[];
};

type ShippoTransactionResponse = {
  object_id?: string;
  object_state?: 'VALID' | 'INVALID';
  status?: 'WAITING' | 'QUEUED' | 'SUCCESS' | 'ERROR' | 'REFUNDED' | 'REFUNDPENDING' | 'REFUNDREJECTED';
  label_url?: string;
  commercial_invoice_url?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  rate?: {
    object_id?: string;
    provider?: string;
    carrier_account?: string;
    servicelevel_name?: string;
    servicelevel_token?: string;
  };
  messages?: ShippoMessage[];
};

export type ShippoCheckoutRate = {
  id: string;
  name: string;
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  shippoRateId: string;
  shippoShipmentId?: string;
  shippoCarrierAccountId?: string;
  estimatedDays?: number | null;
  price: number;
  currencyCode: string;
  source: 'shippo';
};

export type ShippoCustomsSnapshot = {
  description: string;
  quantity: number;
  unitWeight: string;
  netWeight: string;
  massUnit: 'g' | 'kg' | 'lb' | 'oz';
  unitValueAmount: string;
  valueAmount: string;
  valueCurrency: string;
  originCountry: string;
  hsCode: string;
  eccnEar99?: string;
  manufacturerNotes?: string;
  certifySigner: string;
  contentsType: ShippoFulfillmentSettings['contentsType'];
  nonDeliveryOption: ShippoFulfillmentSettings['nonDeliveryOption'];
  incoterm: ShippoFulfillmentSettings['incoterm'];
  metadata: string;
  notes?: string;
};

export type ShippoCustomsOverride = Partial<
  Pick<
    ShippoCustomsSnapshot,
    | 'description'
    | 'quantity'
    | 'unitWeight'
    | 'netWeight'
    | 'massUnit'
    | 'unitValueAmount'
    | 'valueAmount'
    | 'valueCurrency'
    | 'originCountry'
    | 'hsCode'
    | 'eccnEar99'
    | 'manufacturerNotes'
    | 'certifySigner'
    | 'contentsType'
    | 'nonDeliveryOption'
    | 'incoterm'
  >
>;

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

function money(value: number) {
  return Math.max(0.01, value).toFixed(2);
}

function clampMetadata(value: string) {
  return value.trim().slice(0, 100);
}

function buildShippoMessage(messages?: ShippoMessage[], fallback = 'Shippo request failed.') {
  const message = (messages || [])
    .map(entry => [entry.source, entry.code, entry.text].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(', ');

  return message || fallback;
}

function isInternationalShippoShipment(destinationCountryCode: string) {
  const originCountryCode = SHIPPO_ORIGIN.country.trim().toUpperCase();
  return Boolean(
    originCountryCode &&
      destinationCountryCode &&
      originCountryCode !== destinationCountryCode
  );
}

export function resolveConfiguredParcel(itemCount: number) {
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

function mapShippoRate(rate: ShippoRate, currencyCode: string, shipmentId?: string): ShippoCheckoutRate | null {
  const resolvedAmount = chooseRateAmount(rate, currencyCode);

  if (!resolvedAmount || !Number.isFinite(resolvedAmount.amount)) {
    return null;
  }

  const rateId = rate.object_id?.trim();
  if (!rateId) {
    return null;
  }

  const provider = rate.provider?.trim() || 'Shippo';
  const serviceToken = rate.servicelevel?.token?.trim() || rate.servicelevel?.name?.trim() || rateId;
  const carrierAccount = rate.carrier_account?.trim();

  return {
    id: [
      'shippo',
      normalizeRateToken(provider),
      normalizeRateToken(serviceToken),
      carrierAccount ? normalizeRateToken(carrierAccount) : '',
    ].filter(Boolean).join(':'),
    name: rate.servicelevel?.name?.trim() || provider,
    carrier: provider,
    carrierCode: normalizeRateToken(provider),
    serviceCode: rate.servicelevel?.token?.trim() || undefined,
    shippoRateId: rateId,
    shippoShipmentId: shipmentId,
    shippoCarrierAccountId: carrierAccount,
    estimatedDays: rate.estimated_days ?? null,
    price: resolvedAmount.amount,
    currencyCode: resolvedAmount.currencyCode,
    source: 'shippo',
  };
}

function shippoHeaders(headers?: HeadersInit) {
  return {
    Authorization: `ShippoToken ${SHIPPO_API_TOKEN}`,
    'Content-Type': 'application/json',
    'SHIPPO-API-VERSION': SHIPPO_API_VERSION,
    ...(headers || {}),
  };
}

async function shippoRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await providerFetch(`${SHIPPO_API_BASE_URL}${path}`, {
    provider: 'shippo',
    operation: path,
    ...init,
    headers: shippoHeaders(init.headers),
    cache: 'no-store',
  });
  const text = (await response.text()).trim();
  const payload = text ? JSON.parse(text) as T : null;

  if (!response.ok) {
    const messages =
      (payload as { messages?: ShippoMessage[]; detail?: string; error?: string } | null)?.messages;
    const fallback =
      (payload as { detail?: string; error?: string } | null)?.detail ||
      (payload as { detail?: string; error?: string } | null)?.error ||
      `Shippo request failed with status ${response.status}.`;
    throw new Error(buildShippoMessage(messages, fallback));
  }

  return payload as T;
}

export function getShippoMissingConfig() {
  const missing: string[] = [];

  if (!SHIPPO_API_TOKEN) missing.push('SHIPPO_API_TOKEN');
  if (!SHIPPO_ORIGIN.name) missing.push('SHIPPO_ORIGIN_NAME');
  if (!SHIPPO_ORIGIN.email) missing.push('SHIPPO_ORIGIN_EMAIL');
  if (!SHIPPO_ORIGIN.phone) missing.push('SHIPPO_ORIGIN_PHONE');
  if (!SHIPPO_ORIGIN.street1) missing.push('SHIPPO_ORIGIN_STREET1');
  if (!SHIPPO_ORIGIN.city) missing.push('SHIPPO_ORIGIN_CITY');
  if (!SHIPPO_ORIGIN.state) missing.push('SHIPPO_ORIGIN_STATE');
  if (!SHIPPO_ORIGIN.zip) missing.push('SHIPPO_ORIGIN_ZIP');
  if (!SHIPPO_ORIGIN.country) missing.push('SHIPPO_ORIGIN_COUNTRY');

  return missing;
}

export function getShippoConfigStatus() {
  const missing = getShippoMissingConfig();
  return {
    configured: missing.length === 0,
    missing,
    apiBaseUrl: SHIPPO_API_BASE_URL,
    apiVersion: SHIPPO_API_VERSION,
    labelFileType: SHIPPO_LABEL_FILE_TYPE,
    originCountry: SHIPPO_ORIGIN.country,
  } as const;
}

export function isShippoConfigured() {
  return getShippoMissingConfig().length === 0;
}

function resolveUnitValue(args: {
  settings: ShippoFulfillmentSettings;
  overrides?: ShippoCustomsOverride;
  valueMode: 'midpoint' | 'random';
}) {
  const explicitUnitValue = Number(args.overrides?.unitValueAmount);
  if (Number.isFinite(explicitUnitValue) && explicitUnitValue > 0) {
    return explicitUnitValue;
  }

  const explicitTotalValue = Number(args.overrides?.valueAmount);
  const quantity = Math.max(1, Number(args.overrides?.quantity || 1));
  if (Number.isFinite(explicitTotalValue) && explicitTotalValue > 0) {
    return explicitTotalValue / quantity;
  }

  const min = Number(args.settings.unitValueMinAmount);
  const max = Number(args.settings.unitValueMaxAmount);
  const low = Number.isFinite(min) && min > 0 ? min : 20;
  const high = Number.isFinite(max) && max >= low ? max : low;

  if (args.valueMode === 'random' && high > low) {
    return low + Math.random() * (high - low);
  }

  return (low + high) / 2;
}

export function buildShippoCustomsSnapshot(args: {
  settings: ShippoFulfillmentSettings;
  itemCount: number;
  orderId?: string;
  overrides?: ShippoCustomsOverride;
  valueMode?: 'midpoint' | 'random';
}) {
  const quantity = Math.max(1, Math.round(Number(args.overrides?.quantity || args.itemCount || 1)));
  const unitWeight = Math.max(0.001, Number(args.overrides?.unitWeight || args.settings.unitWeight || 0.3));
  const netWeightOverride = Number(args.overrides?.netWeight);
  const netWeight = Number.isFinite(netWeightOverride) && netWeightOverride > 0
    ? netWeightOverride
    : unitWeight * quantity;
  const unitValue = resolveUnitValue({
    settings: args.settings,
    overrides: args.overrides,
    valueMode: args.valueMode || 'midpoint',
  });
  const totalValueOverride = Number(args.overrides?.valueAmount);
  const valueAmount = Number.isFinite(totalValueOverride) && totalValueOverride > 0
    ? totalValueOverride
    : unitValue * quantity;
  const metadata = clampMetadata(args.orderId ? `Order ${args.orderId}` : 'Revalin customs');
  const manufacturerNotes = args.overrides?.manufacturerNotes ?? args.settings.manufacturerNotes;

  return {
    description: (args.overrides?.description || args.settings.customsDescription).trim(),
    quantity,
    unitWeight: String(unitWeight),
    netWeight: String(Number(netWeight.toFixed(3))),
    massUnit: args.overrides?.massUnit || args.settings.massUnit,
    unitValueAmount: money(unitValue),
    valueAmount: money(valueAmount),
    valueCurrency: (args.overrides?.valueCurrency || args.settings.valueCurrency).trim().toUpperCase(),
    originCountry: (args.overrides?.originCountry || args.settings.originCountry).trim().toUpperCase(),
    hsCode: (args.overrides?.hsCode || args.settings.hsCode).trim(),
    eccnEar99: (args.overrides?.eccnEar99 ?? args.settings.eccnEar99).trim() || undefined,
    manufacturerNotes: manufacturerNotes?.trim() || undefined,
    certifySigner: (args.overrides?.certifySigner || args.settings.certifySigner).trim(),
    contentsType: args.overrides?.contentsType || args.settings.contentsType,
    nonDeliveryOption: args.overrides?.nonDeliveryOption || args.settings.nonDeliveryOption,
    incoterm: args.overrides?.incoterm || args.settings.incoterm,
    metadata,
    notes: manufacturerNotes ? manufacturerNotes.trim() : undefined,
  } satisfies ShippoCustomsSnapshot;
}

export function validateShippoCustomsSnapshot(snapshot: ShippoCustomsSnapshot) {
  const missing: string[] = [];

  if (!snapshot.description) missing.push('description');
  if (!snapshot.quantity || snapshot.quantity < 1) missing.push('quantity');
  if (!Number(snapshot.netWeight) || Number(snapshot.netWeight) <= 0) missing.push('net_weight');
  if (!snapshot.valueAmount || Number(snapshot.valueAmount) <= 0) missing.push('value_amount');
  if (!snapshot.valueCurrency) missing.push('value_currency');
  if (!snapshot.originCountry) missing.push('origin_country');
  if (!snapshot.hsCode) missing.push('hs_code');
  if (!snapshot.certifySigner) missing.push('certify_signer');

  return missing;
}

function toShippoCustomsDeclaration(snapshot: ShippoCustomsSnapshot) {
  const item: Record<string, unknown> = {
    description: snapshot.description,
    quantity: snapshot.quantity,
    net_weight: snapshot.netWeight,
    mass_unit: snapshot.massUnit,
    value_amount: snapshot.valueAmount,
    value_currency: snapshot.valueCurrency,
    origin_country: snapshot.originCountry,
    hs_code: snapshot.hsCode,
    metadata: snapshot.metadata,
  };

  if (snapshot.eccnEar99) {
    item.eccn_ear99 = snapshot.eccnEar99;
  }

  return {
    contents_type: snapshot.contentsType,
    non_delivery_option: snapshot.nonDeliveryOption,
    certify: true,
    certify_signer: snapshot.certifySigner,
    incoterm: snapshot.incoterm,
    commercial_invoice: true,
    metadata: snapshot.metadata,
    notes: snapshot.notes,
    items: [item],
  };
}

function buildShipmentBody(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  customsSnapshot?: ShippoCustomsSnapshot | null;
  orderId?: string;
}) {
  const countryCode = args.shippingAddress.country.trim().toUpperCase();
  const body: Record<string, unknown> = {
    address_from: {
      name: SHIPPO_ORIGIN.name,
      email: SHIPPO_ORIGIN.email,
      phone: SHIPPO_ORIGIN.phone,
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
      country: countryCode,
      validate: false,
    },
    parcels: [resolveConfiguredParcel(args.itemCount)],
    metadata: clampMetadata(args.orderId ? `Order ${args.orderId}` : 'Revalin quote'),
    async: false,
  };

  if (args.customsSnapshot) {
    body.customs_declaration = toShippoCustomsDeclaration(args.customsSnapshot);
  }

  return body;
}

export async function quoteShippoRates(args: {
  shippingAddress: CheckoutShippingAddress;
  itemCount: number;
  currencyCode: string;
  orderId?: string;
  customsSettings?: ShippoFulfillmentSettings;
  customsSnapshot?: ShippoCustomsSnapshot | null;
}) {
  if (!isShippoConfigured()) {
    return null;
  }

  const destinationCountryCode = args.shippingAddress.country.trim().toUpperCase();
  const customsSnapshot = args.customsSnapshot ??
    (args.customsSettings && isInternationalShippoShipment(destinationCountryCode)
      ? buildShippoCustomsSnapshot({
          settings: args.customsSettings,
          itemCount: args.itemCount,
          orderId: args.orderId,
          valueMode: 'midpoint',
        })
      : null);

  if (customsSnapshot) {
    const missing = validateShippoCustomsSnapshot(customsSnapshot);
    if (missing.length > 0) {
      throw new Error(`Shippo customs configuration is missing: ${missing.join(', ')}.`);
    }
  }

  const payload = await shippoRequest<ShippoShipmentResponse>('/shipments/', {
    method: 'POST',
    body: JSON.stringify(buildShipmentBody({
      shippingAddress: args.shippingAddress,
      itemCount: args.itemCount,
      customsSnapshot,
      orderId: args.orderId,
    })),
  });

  const rates = (payload.rates || [])
    .map(rate => mapShippoRate(rate, args.currencyCode, payload.object_id))
    .filter((rate): rate is ShippoCheckoutRate => rate !== null);

  if (rates.length === 0 && payload.messages?.length) {
    throw new Error(buildShippoMessage(payload.messages, 'Shippo returned no rates.'));
  }

  return {
    shipmentId: payload.object_id,
    rates,
    messages: payload.messages || [],
    customsSnapshot,
  };
}

export async function purchaseShippoLabel(args: {
  rateId: string;
  orderId?: string;
}) {
  if (!isShippoConfigured()) {
    throw new Error(`Shippo is not fully configured: ${getShippoMissingConfig().join(', ')}.`);
  }

  const transaction = await shippoRequest<ShippoTransactionResponse>('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      rate: args.rateId,
      async: false,
      label_file_type: SHIPPO_LABEL_FILE_TYPE,
      metadata: clampMetadata(args.orderId ? `Order ${args.orderId}` : 'Revalin label'),
    }),
  });

  if (transaction.status && transaction.status !== 'SUCCESS') {
    throw new Error(buildShippoMessage(transaction.messages, `Shippo label purchase returned ${transaction.status}.`));
  }

  if (!transaction.label_url) {
    throw new Error(buildShippoMessage(transaction.messages, 'Shippo purchased the rate but did not return a label URL.'));
  }

  return {
    provider: 'shippo' as const,
    shippoTransactionId: transaction.object_id || null,
    shippoRateId: transaction.rate?.object_id || args.rateId,
    shippoCarrierAccountId: transaction.rate?.carrier_account || null,
    trackingCode: transaction.tracking_number || null,
    labelUrl: transaction.label_url || null,
    carrier: transaction.rate?.provider || null,
    service: transaction.rate?.servicelevel_name || transaction.rate?.servicelevel_token || null,
    publicTrackingUrl: transaction.tracking_url_provider || null,
    commercialInvoiceUrl: transaction.commercial_invoice_url || null,
  };
}
