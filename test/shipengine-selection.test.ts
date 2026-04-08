import assert from "node:assert/strict";
import test from "node:test";

import { selectShipEngineRateForService, type ShipEnginePurchasableRate } from "../lib/checkout/shipengine.ts";
import type { CheckoutShippingService } from "../lib/checkout/types.ts";

function buildSelectedShippingService(
  overrides: Partial<CheckoutShippingService> = {},
): CheckoutShippingService {
  return {
    id: "shipengine:ups:ground",
    name: "UPS Ground",
    source: "shipengine",
    carrier: "UPS",
    carrierCode: "ups",
    serviceCode: "ups_ground",
    shipengineRateId: "rate_selected",
    estimatedDays: 3,
    price: {
      amount: "18.00",
      currencyCode: "USD",
    },
    ...overrides,
  };
}

function buildRate(overrides: Partial<ShipEnginePurchasableRate> = {}): ShipEnginePurchasableRate {
  return {
    rate_id: "rate_default",
    carrier_code: "ups",
    carrier_friendly_name: "UPS",
    service_code: "ups_ground",
    service_type: "UPS Ground",
    shipping_amount: {
      amount: 18,
      currency: "USD",
    },
    ...overrides,
  };
}

test("selectShipEngineRateForService only chooses exact carrier and service matches", () => {
  const selectedShippingService = buildSelectedShippingService();
  const rates = [
    buildRate({
      rate_id: "rate_cheaper_wrong_service",
      service_code: "ups_express",
      service_type: "UPS Express",
      shipping_amount: { amount: 5, currency: "USD" },
    }),
    buildRate({
      rate_id: "rate_exact_more_expensive",
      shipping_amount: { amount: 19, currency: "USD" },
    }),
    buildRate({
      rate_id: "rate_exact_cheaper",
      shipping_amount: { amount: 17, currency: "USD" },
    }),
  ];

  const selectedRate = selectShipEngineRateForService({
    rates,
    selectedShippingService,
  });

  assert.equal(selectedRate.rate_id, "rate_exact_cheaper");
  assert.equal(selectedRate.service_code, "ups_ground");
});

test("selectShipEngineRateForService rejects unavailable exact service matches", () => {
  const selectedShippingService = buildSelectedShippingService({
    serviceCode: "ups_ground",
  });
  const rates = [
    buildRate({
      rate_id: "rate_only_express",
      service_code: "ups_express",
      service_type: "UPS Express",
    }),
  ];

  assert.throws(
    () =>
      selectShipEngineRateForService({
        rates,
        selectedShippingService,
      }),
    /selected shipping service .* no longer available/i,
  );
});

test("selectShipEngineRateForService rejects non-ShipEngine checkout services", () => {
  const selectedShippingService = buildSelectedShippingService({
    source: "swell",
  });
  const rates = [buildRate()];

  assert.throws(
    () =>
      selectShipEngineRateForService({
        rates,
        selectedShippingService,
      }),
    /not sourced from ShipEngine/i,
  );
});

test("selectShipEngineRateForService rejects ShipEngine services missing identity metadata", () => {
  const selectedShippingService = buildSelectedShippingService({
    carrierCode: undefined,
  });
  const rates = [buildRate()];

  assert.throws(
    () =>
      selectShipEngineRateForService({
        rates,
        selectedShippingService,
      }),
    /missing carrier\/service identity/i,
  );
});
