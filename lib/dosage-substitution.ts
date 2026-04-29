import { getInventoryState } from '@/lib/inventory';
import type { Product, ProductVariant } from '@/lib/swell/types';

const DOSE_RATIO = 2;
const DOSE_RATIO_TOLERANCE = 0.15;

function getVariantDoseMg(variant: ProductVariant): number | null {
  const text = [
    variant.title,
    variant.sku,
    ...variant.selectedOptions.flatMap(option => [option.name, option.value]),
  ]
    .filter(Boolean)
    .join(' ');

  const match = text.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|ug|µg|g)\b/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit === 'g') return amount * 1000;
  if (unit === 'mcg' || unit === 'ug' || unit === 'µg') return amount / 1000;
  return amount;
}

export type DosageSubstitution = {
  requestedVariant?: ProductVariant | null;
  cartVariant?: ProductVariant | null;
  quantityMultiplier: number;
  isSubstitution: boolean;
};

export function resolveDosageSubstitution(
  product: Product,
  requestedVariant?: ProductVariant | null
): DosageSubstitution {
  const fallback = {
    requestedVariant,
    cartVariant: requestedVariant,
    quantityMultiplier: 1,
    isSubstitution: false,
  };

  if (!requestedVariant || product.variants.length < 2) {
    return fallback;
  }

  const requestedInventory = getInventoryState(product, requestedVariant);
  if (!requestedInventory.isBackorder) {
    return fallback;
  }

  const requestedDose = getVariantDoseMg(requestedVariant);
  if (!requestedDose) {
    return fallback;
  }

  const lowerDoseCandidates = product.variants
    .map(variant => ({
      variant,
      dose: getVariantDoseMg(variant),
      inventory: getInventoryState(product, variant),
    }))
    .filter(candidate => {
      if (!candidate.dose || candidate.variant.id === requestedVariant.id) return false;
      if (candidate.dose >= requestedDose || candidate.inventory.isBackorder) return false;

      const ratio = requestedDose / candidate.dose;
      return Math.abs(ratio - DOSE_RATIO) <= DOSE_RATIO_TOLERANCE;
    })
    .sort((left, right) => right.dose! - left.dose!);

  const lowerDoseCandidate = lowerDoseCandidates[0];
  if (!lowerDoseCandidate) {
    return fallback;
  }

  return {
    requestedVariant,
    cartVariant: lowerDoseCandidate.variant,
    quantityMultiplier: DOSE_RATIO,
    isSubstitution: true,
  };
}
