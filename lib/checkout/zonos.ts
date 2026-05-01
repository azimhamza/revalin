import { apiError } from '@/lib/api/errors';
import { providerFetch } from '@/lib/api/provider-client';
import { toMoney } from '@/lib/checkout/pricing';
import type { CheckoutLandedCost, CheckoutShippingAddress } from '@/lib/checkout/types';
import type { CheckoutRatedService } from '@/lib/checkout/shipping-rates';

type MoneyLike = {
  amount?: string | number | null;
  currencyCode?: string | null;
};

type ZonosCartLine = {
  id?: string;
  merchandiseId?: string;
  productHandle?: string;
  productTitle?: string;
  variantTitle?: string;
  skuNumber?: string;
  quantity: number;
  unitPrice?: MoneyLike;
  lineTotal?: MoneyLike;
};

type ZonosCartSnapshot = {
  currencyCode: string;
  lines: ZonosCartLine[];
};

type ZonosAmountDetail = {
  amount?: string | number | null;
  currency?: string | null;
};

type ZonosLandedCostResponse = {
  id?: string;
  amountSubtotals?: {
    duties?: string | number | null;
    taxes?: string | number | null;
    fees?: string | number | null;
  } | null;
  duties?: ZonosAmountDetail[] | null;
  taxes?: ZonosAmountDetail[] | null;
  fees?: ZonosAmountDetail[] | null;
};

type ZonosGraphqlResponse = {
  data?: {
    landedCostCalculateWorkflow?: ZonosLandedCostResponse[] | null;
  };
  errors?: Array<{ message?: string }>;
};

const ZONOS_API_BASE = (process.env.ZONOS_API_BASE || 'https://api.zonos.com/graphql').trim();
const ZONOS_CREDENTIAL_TOKEN = (
  process.env.ZONOS_CREDENTIAL_TOKEN ||
  process.env.ZONOS_CREDENTIAL ||
  process.env.ZONOS_API_KEY ||
  ''
).trim();
const ZONOS_LANDED_COST_ENABLED = process.env.ZONOS_ENABLE_LANDED_COST !== 'false';
const ZONOS_REQUIRE_LANDED_COST = process.env.ZONOS_REQUIRE_LANDED_COST === 'true';
const ZONOS_CALCULATION_METHOD = (
  process.env.ZONOS_DUTY_TAX_MODE ||
  process.env.ZONOS_CALCULATION_METHOD ||
  'DDP_PREFERRED'
).trim();
const ZONOS_TARIFF_RATE = (process.env.ZONOS_TARIFF_RATE || 'ZONOS_PREFERRED').trim();
const ZONOS_END_USE = (process.env.ZONOS_END_USE || 'NOT_FOR_RESALE').trim();
const ZONOS_DEFAULT_SERVICE_LEVEL_CODE = (
  process.env.ZONOS_DEFAULT_SERVICE_LEVEL_CODE || ''
).trim();

const originCountry = normalizeCountry(
  process.env.ZONOS_ORIGIN_COUNTRY ||
    process.env.SHIPENGINE_ORIGIN_COUNTRY ||
    'CA',
);

const CALCULATE_LANDED_COST_MUTATION = `
mutation CalculateCheckoutLandedCost(
  $parties: [PartyCreateWorkflowInput!]!
  $items: [ItemCreateWorkflowInput!]!
  $shipmentRating: ShipmentRatingCreateWorkflowInput!
  $landedCostConfig: LandedCostWorkFlowInput!
) {
  partyCreateWorkflow(input: $parties) {
    id
    type
  }
  itemCreateWorkflow(input: $items) {
    id
  }
  shipmentRatingCreateWorkflow(input: $shipmentRating) {
    id
    amount
  }
  landedCostCalculateWorkflow(input: $landedCostConfig) {
    id
    amountSubtotals {
      duties
      taxes
      fees
    }
    duties {
      amount
      currency
    }
    taxes {
      amount
      currency
    }
    fees {
      amount
      currency
    }
  }
}
`;

function normalizeCountry(value?: string | null) {
  return (value || '').trim().toUpperCase();
}

function normalizeOptional(value?: string | null) {
  const trimmed = (value || '').trim();
  return trimmed || undefined;
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumDetails(details?: ZonosAmountDetail[] | null) {
  if (!Array.isArray(details)) return 0;
  return details.reduce((total, detail) => total + toNumber(detail.amount), 0);
}

function buildOriginLocation() {
  return {
    countryCode: originCountry,
    administrativeAreaCode: normalizeOptional(
      process.env.ZONOS_ORIGIN_STATE || process.env.SHIPENGINE_ORIGIN_STATE || 'ON',
    ),
    locality: normalizeOptional(
      process.env.ZONOS_ORIGIN_CITY || process.env.SHIPENGINE_ORIGIN_CITY || 'Waterloo',
    ),
    line1: normalizeOptional(
      process.env.ZONOS_ORIGIN_STREET1 || process.env.SHIPENGINE_ORIGIN_STREET1,
    ),
    line2: normalizeOptional(
      process.env.ZONOS_ORIGIN_STREET2 || process.env.SHIPENGINE_ORIGIN_STREET2,
    ),
    postalCode: normalizeOptional(
      process.env.ZONOS_ORIGIN_POSTAL_CODE ||
        process.env.ZONOS_ORIGIN_ZIP ||
        process.env.SHIPENGINE_ORIGIN_ZIP,
    ),
  };
}

function buildDestinationLocation(shippingAddress: CheckoutShippingAddress) {
  return {
    countryCode: normalizeCountry(shippingAddress.country),
    administrativeAreaCode: normalizeOptional(shippingAddress.province),
    locality: normalizeOptional(shippingAddress.city),
    line1: normalizeOptional(shippingAddress.address1),
    line2: normalizeOptional(shippingAddress.address2),
    postalCode: normalizeOptional(shippingAddress.postalCode),
  };
}

function getMissingRequiredZonosConfig() {
  const originLocation = buildOriginLocation();
  const missing: string[] = [];

  if (!ZONOS_CREDENTIAL_TOKEN) missing.push('ZONOS_CREDENTIAL_TOKEN');
  if (!originLocation.countryCode) missing.push('ZONOS_ORIGIN_COUNTRY');
  if (!originLocation.line1) missing.push('ZONOS_ORIGIN_STREET1');
  if (!originLocation.postalCode) missing.push('ZONOS_ORIGIN_POSTAL_CODE');

  return missing;
}

export function isZonosConfigured() {
  return ZONOS_LANDED_COST_ENABLED && Boolean(ZONOS_CREDENTIAL_TOKEN);
}

export function isZonosLandedCostEligible(shippingAddress: CheckoutShippingAddress) {
  const destinationCountry = normalizeCountry(shippingAddress.country);
  return Boolean(destinationCountry && originCountry && destinationCountry !== originCountry);
}

function normalizeServiceToken(value?: string | null) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveServiceLevelCode(service: CheckoutRatedService) {
  if (ZONOS_DEFAULT_SERVICE_LEVEL_CODE) {
    return ZONOS_DEFAULT_SERVICE_LEVEL_CODE;
  }

  const serviceCode = normalizeServiceToken(service.serviceCode || service.id || service.name);
  const carrierCode = normalizeServiceToken(service.carrierCode || service.carrier);

  if (!serviceCode) {
    return 'standard';
  }

  if (serviceCode.includes('.') || !carrierCode) {
    return serviceCode;
  }

  const carrierPrefix = `${carrierCode}_`;
  if (serviceCode.startsWith(carrierPrefix)) {
    return `${carrierCode}.${serviceCode.slice(carrierPrefix.length)}`;
  }

  return `${carrierCode}.${serviceCode}`;
}

function buildZonosItems(cartSnapshot: ZonosCartSnapshot, currencyCode: string) {
  const countryOfOrigin = normalizeCountry(
    process.env.ZONOS_DEFAULT_ITEM_COUNTRY_OF_ORIGIN ||
      process.env.SHIPENGINE_CUSTOMS_COUNTRY_OF_ORIGIN ||
      originCountry,
  );

  return cartSnapshot.lines
    .map((line, index) => {
      const quantity = Math.max(1, Math.round(Number(line.quantity || 1)));
      const unitAmount = toNumber(line.unitPrice?.amount);
      const lineAmount = toNumber(line.lineTotal?.amount);
      const amount =
        unitAmount > 0
          ? unitAmount
          : lineAmount > 0
            ? lineAmount / quantity
            : 0.01;
      const productId =
        line.productHandle ||
        line.merchandiseId ||
        line.id ||
        `checkout-item-${index + 1}`;

      return {
        amount: roundCurrency(Math.max(0.01, amount)),
        currencyCode,
        quantity,
        countryOfOrigin,
        productId,
        sku: normalizeOptional(line.skuNumber),
        name: normalizeOptional(line.productTitle || line.productHandle) || productId,
        description:
          normalizeOptional(line.variantTitle) ||
          normalizeOptional(line.productTitle || line.productHandle) ||
          productId,
      };
    })
    .filter(item => item.quantity > 0);
}

function parseZonosLandedCost(args: {
  landedCost: ZonosLandedCostResponse;
  currencyCode: string;
  serviceLevelCode: string;
}): CheckoutLandedCost {
  const subtotalDuties =
    toNumber(args.landedCost.amountSubtotals?.duties) || sumDetails(args.landedCost.duties);
  const subtotalTaxes =
    toNumber(args.landedCost.amountSubtotals?.taxes) || sumDetails(args.landedCost.taxes);
  const subtotalFees =
    toNumber(args.landedCost.amountSubtotals?.fees) || sumDetails(args.landedCost.fees);
  const importChargeTotal = roundCurrency(subtotalDuties + subtotalTaxes + subtotalFees);

  return {
    provider: 'zonos',
    id: args.landedCost.id,
    amount: toMoney(importChargeTotal, args.currencyCode),
    dutiesAmount: toMoney(subtotalDuties, args.currencyCode),
    importTaxAmount: toMoney(subtotalTaxes, args.currencyCode),
    feesAmount: toMoney(subtotalFees, args.currencyCode),
    calculationMethod: ZONOS_CALCULATION_METHOD,
    tariffRate: ZONOS_TARIFF_RATE,
    serviceLevelCode: args.serviceLevelCode,
  };
}

function getZonosErrorMessage(payload: ZonosGraphqlResponse, responseStatus?: number) {
  const graphQlMessage = payload.errors
    ?.map(error => error.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join('; ');

  return graphQlMessage || `Zonos landed cost request failed${responseStatus ? ` with status ${responseStatus}` : ''}.`;
}

function handleZonosFailure(error: unknown, context: Record<string, unknown>) {
  if (ZONOS_REQUIRE_LANDED_COST) {
    if (error instanceof Error) {
      throw error;
    }

    throw apiError.providerUnavailable(
      'Unable to calculate duties and import taxes for this shipment.',
      {
        provider: 'zonos',
        ...context,
      },
      false,
    );
  }

  console.error('Unable to calculate Zonos landed cost.', {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
  return null;
}

export async function quoteZonosLandedCost(args: {
  shippingAddress: CheckoutShippingAddress;
  cartSnapshot: ZonosCartSnapshot;
  service: CheckoutRatedService;
  currencyCode?: string | null;
}): Promise<CheckoutLandedCost | null> {
  const currencyCode = normalizeCountry(args.currencyCode || args.cartSnapshot.currencyCode || 'USD');

  if (!ZONOS_LANDED_COST_ENABLED || !isZonosLandedCostEligible(args.shippingAddress) || args.service.pickup) {
    return null;
  }
  if (!ZONOS_CREDENTIAL_TOKEN && !ZONOS_REQUIRE_LANDED_COST) {
    return null;
  }

  const missingConfig = getMissingRequiredZonosConfig();
  if (missingConfig.length > 0) {
    return handleZonosFailure(
      apiError.providerUnavailable(
        'Zonos landed cost is not configured.',
        {
          provider: 'zonos',
          missingConfig,
        },
        false,
      ),
      {
        missingConfig,
        destinationCountry: normalizeCountry(args.shippingAddress.country),
        serviceId: args.service.id,
      },
    );
  }

  const destinationLocation = buildDestinationLocation(args.shippingAddress);
  if (!destinationLocation.countryCode || !destinationLocation.line1 || !destinationLocation.postalCode) {
    return handleZonosFailure(
      apiError.badRequest('Shipping address is missing required landed-cost fields.'),
      {
        destinationCountry: destinationLocation.countryCode,
        serviceId: args.service.id,
      },
    );
  }

  const items = buildZonosItems(args.cartSnapshot, currencyCode);
  if (items.length === 0) {
    return null;
  }

  const serviceLevelCode = resolveServiceLevelCode(args.service);
  const variables = {
    parties: [
      {
        type: 'ORIGIN',
        location: buildOriginLocation(),
      },
      {
        type: 'DESTINATION',
        location: destinationLocation,
        person: {
          email: args.shippingAddress.email,
          firstName: args.shippingAddress.firstName || 'Customer',
          lastName: args.shippingAddress.lastName || 'Customer',
          phone: args.shippingAddress.phone,
        },
      },
    ],
    items,
    shipmentRating: {
      amount: roundCurrency(Math.max(0, toNumber(args.service.price.amount))),
      currencyCode,
      displayName: args.service.name,
      serviceLevelCode,
    },
    landedCostConfig: {
      calculationMethod: ZONOS_CALCULATION_METHOD,
      currencyCode,
      endUse: ZONOS_END_USE,
      tariffRate: ZONOS_TARIFF_RATE,
    },
  };

  try {
    const response = await providerFetch(ZONOS_API_BASE, {
      provider: 'zonos',
      operation: 'calculate-landed-cost',
      route: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        credentialToken: ZONOS_CREDENTIAL_TOKEN,
      },
      body: JSON.stringify({
        query: CALCULATE_LANDED_COST_MUTATION,
        variables,
      }),
      retryable: true,
      timeoutMs: 7_000,
    });

    const payload = (await response.json()) as ZonosGraphqlResponse;
    const landedCost = payload.data?.landedCostCalculateWorkflow?.[0];

    if (!response.ok || payload.errors?.length || !landedCost) {
      throw apiError.providerUnavailable(
        getZonosErrorMessage(payload, response.status),
        {
          provider: 'zonos',
          operation: 'calculate-landed-cost',
          destinationCountry: destinationLocation.countryCode,
          serviceLevelCode,
          status: response.status,
        },
        false,
      );
    }

    return parseZonosLandedCost({
      landedCost,
      currencyCode,
      serviceLevelCode,
    });
  } catch (error) {
    return handleZonosFailure(error, {
      destinationCountry: destinationLocation.countryCode,
      serviceId: args.service.id,
      serviceLevelCode,
    });
  }
}

export async function applyZonosLandedCostToServices(args: {
  shippingAddress: CheckoutShippingAddress;
  cartSnapshot: ZonosCartSnapshot;
  services: CheckoutRatedService[];
  currencyCode?: string | null;
}) {
  if (!isZonosConfigured() || !isZonosLandedCostEligible(args.shippingAddress)) {
    return args.services;
  }

  const quotedServices = await Promise.all(
    args.services.map(async (service) => {
      const landedCost = await quoteZonosLandedCost({
        shippingAddress: args.shippingAddress,
        cartSnapshot: args.cartSnapshot,
        service,
        currencyCode: args.currencyCode,
      });

      if (!landedCost) {
        return service;
      }

      return {
        ...service,
        landedCostAmount: landedCost.amount,
        landedCost,
      } satisfies CheckoutRatedService;
    }),
  );

  return quotedServices;
}
