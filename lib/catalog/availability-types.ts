export type CatalogAvailabilityVariantInput = {
  id: string;
  sku?: string | null;
};

export type CatalogAvailabilityProductInput = {
  handle: string;
  productId?: string | null;
  variants?: CatalogAvailabilityVariantInput[];
};

export type CatalogAvailabilityEstimate = {
  availableToShipNow: number;
  isHighDemand: boolean;
  shippingLeadTimeLabel: string;
  internalInventoryMatched: boolean;
};

export type CatalogAvailabilityVariant = CatalogAvailabilityEstimate & {
  id: string;
  sku?: string | null;
};

export type CatalogAvailabilityProduct = CatalogAvailabilityEstimate & {
  handle: string;
  productId?: string | null;
  variants: CatalogAvailabilityVariant[];
};
