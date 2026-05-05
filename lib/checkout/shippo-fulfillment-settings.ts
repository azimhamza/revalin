import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appSettings } from '@/lib/db/schema';

export const SHIPPO_FULFILLMENT_SETTINGS_KEY = 'shippo_fulfillment';

const DEFAULT_MANUFACTURER_NOTES = [
  'Anhui Yaotong Trading Co.,Ltd',
  'No. B904, Building B, Juchuan Square, 8 Yingzhou North Road, Zhongshi Sub-district Office, Yingquan District, Fuyang City, Anhui Province',
].join('\n');

export const shippoFulfillmentSettingsSchema = z.object({
  customsDescription: z.string().trim().min(1).default('Cosmetic skin care preparation, non-medicated, non-hazardous, for personal use'),
  unitWeight: z.string().trim().min(1).default('0.05'),
  massUnit: z.enum(['g', 'kg', 'lb', 'oz']).default('kg'),
  unitValueMinAmount: z.string().trim().min(1).default('20.00'),
  unitValueMaxAmount: z.string().trim().min(1).default('30.00'),
  valueCurrency: z.string().trim().length(3).default('USD'),
  originCountry: z.string().trim().length(2).default('CN'),
  hsCode: z.string().trim().min(1).default('3304.99'),
  eccnEar99: z.string().trim().default('EAR99'),
  manufacturerNotes: z.string().trim().default(DEFAULT_MANUFACTURER_NOTES),
  certifySigner: z.string().trim().default(''),
  contentsType: z.enum([
    'DOCUMENTS',
    'GIFT',
    'SAMPLE',
    'MERCHANDISE',
    'HUMANITARIAN_DONATION',
    'RETURN_MERCHANDISE',
    'OTHER',
  ]).default('MERCHANDISE'),
  nonDeliveryOption: z.enum(['RETURN', 'ABANDON']).default('RETURN'),
  incoterm: z.enum(['DDU', 'DDP']).default('DDU'),
});

export type ShippoFulfillmentSettings = z.infer<typeof shippoFulfillmentSettingsSchema>;

export const DEFAULT_SHIPPO_FULFILLMENT_SETTINGS: ShippoFulfillmentSettings =
  shippoFulfillmentSettingsSchema.parse({});

function normalizeMoneyString(value: string, fallback: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return fallback;
  }

  return amount.toFixed(2);
}

export function normalizeShippoFulfillmentSettings(
  value: unknown,
): ShippoFulfillmentSettings {
  const parsed = shippoFulfillmentSettingsSchema.parse(value ?? {});
  const minAmount = normalizeMoneyString(
    parsed.unitValueMinAmount,
    DEFAULT_SHIPPO_FULFILLMENT_SETTINGS.unitValueMinAmount,
  );
  const maxAmount = normalizeMoneyString(
    parsed.unitValueMaxAmount,
    DEFAULT_SHIPPO_FULFILLMENT_SETTINGS.unitValueMaxAmount,
  );
  const min = Number(minAmount);
  const max = Number(maxAmount);

  return {
    ...parsed,
    unitWeight: String(Math.max(0.001, Number(parsed.unitWeight) || Number(DEFAULT_SHIPPO_FULFILLMENT_SETTINGS.unitWeight))),
    unitValueMinAmount: Math.min(min, max).toFixed(2),
    unitValueMaxAmount: Math.max(min, max).toFixed(2),
    valueCurrency: parsed.valueCurrency.toUpperCase(),
    originCountry: parsed.originCountry.toUpperCase(),
    certifySigner: parsed.certifySigner || process.env.SHIPPO_ORIGIN_NAME?.trim() || '',
  };
}

export async function getShippoFulfillmentSettings() {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SHIPPO_FULFILLMENT_SETTINGS_KEY))
    .limit(1);

  return normalizeShippoFulfillmentSettings(rows[0]?.value);
}

export async function saveShippoFulfillmentSettings(args: {
  value: ShippoFulfillmentSettings;
  updatedByUserId?: string | null;
}) {
  const normalized = normalizeShippoFulfillmentSettings(args.value);
  const now = new Date();

  const [row] = await db
    .insert(appSettings)
    .values({
      key: SHIPPO_FULFILLMENT_SETTINGS_KEY,
      value: normalized,
      updatedByUserId: args.updatedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: normalized,
        updatedByUserId: args.updatedByUserId ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return normalizeShippoFulfillmentSettings(row?.value);
}
