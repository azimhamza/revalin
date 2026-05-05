'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Package,
  Play,
  RefreshCw,
  Truck,
  Zap,
} from 'lucide-react';
import type {
  FulfillmentLabelPreview,
  FulfillmentOrderListItem,
} from '@/lib/checkout/fulfillment-service';

type Props = {
  order: FulfillmentOrderListItem;
  onActionComplete: () => void;
  isDev?: boolean;
};

type ActionResponse = {
  data?: {
    hasLabel?: boolean;
    labelError?: string | null;
  };
};

async function postAction(orderId: string, action: string) {
  return postActionBody(orderId, action);
}

async function postActionBody(
  orderId: string,
  action: string,
  body?: unknown,
) {
  const response = await fetch(
    `/api/admin/fulfillment/${encodeURIComponent(orderId)}/${action}`,
    {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Action failed (${response.status})`,
    );
  }

  return response.json() as Promise<ActionResponse>;
}

type ManualLabelForm = FulfillmentOrderListItem['shippingAddress'];
type ManualLabelCustoms = NonNullable<FulfillmentLabelPreview['customs']>;
type ManualLabelPayload = {
  shippingAddress: ManualLabelForm;
  selectedShippingServiceId: string;
  customs?: ManualLabelCustoms | null;
};

function formatRatePrice(rate: FulfillmentLabelPreview['rates'][number]) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: rate.price.currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(rate.price.amount));
}

function formatRateProvider(rate: FulfillmentLabelPreview['rates'][number]) {
  if (rate.source === 'shippo') return 'Shippo';
  if (rate.source === 'shipengine') return 'ShipEngine';
  return 'Carrier';
}

function normalizeManualLabelAddress(form: ManualLabelForm): ManualLabelForm {
  return {
    ...form,
    country: form.country.trim().toUpperCase(),
    address2: form.address2?.trim() || undefined,
    notes: form.notes?.trim() || undefined,
  };
}

function isManualLabelAddressReady(form: ManualLabelForm) {
  return Boolean(
    form.firstName?.trim() &&
      form.lastName?.trim() &&
      form.email?.trim() &&
      form.phone?.trim() &&
      form.address1?.trim() &&
      form.city?.trim() &&
      form.province?.trim() &&
      form.postalCode?.trim() &&
      form.country?.trim().length === 2,
  );
}

function ManualLabelModal({
  order,
  onSubmit,
  onCancel,
  loading,
}: {
  order: FulfillmentOrderListItem;
  onSubmit: (payload: ManualLabelPayload) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ManualLabelForm>({
    firstName: order.shippingAddress.firstName || '',
    lastName: order.shippingAddress.lastName || '',
    email: order.shippingAddress.email || order.email || '',
    phone: order.shippingAddress.phone || '',
    address1: order.shippingAddress.address1 || '',
    address2: order.shippingAddress.address2 || '',
    city: order.shippingAddress.city || '',
    province: order.shippingAddress.province || '',
    postalCode: order.shippingAddress.postalCode || '',
    country: order.shippingAddress.country || 'CA',
    notes: order.shippingAddress.notes || '',
  });
  const [preview, setPreview] = useState<FulfillmentLabelPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedShippingServiceId, setSelectedShippingServiceId] =
    useState('');
  const [customs, setCustoms] = useState<ManualLabelCustoms | null>(null);
  const initialPreviewRequested = useRef(false);

  const updateField = (field: keyof ManualLabelForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setPreview(null);
    setSelectedShippingServiceId('');
    setPreviewError(null);
  };

  const updateCustomsField = (
    field: keyof ManualLabelCustoms,
    value: string | number,
  ) => {
    setCustoms((current) =>
      current
        ? ({
            ...current,
            [field]: value,
          } as ManualLabelCustoms)
        : current,
    );
    setPreview(null);
    setSelectedShippingServiceId('');
    setPreviewError(null);
  };

  const fetchPreview = useCallback(async () => {
    if (!isManualLabelAddressReady(form)) {
      setPreview(null);
      setSelectedShippingServiceId('');
      setPreviewError('Complete the destination address before getting rates.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch(
        `/api/admin/fulfillment/${encodeURIComponent(order.orderId)}/label-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shippingAddress: normalizeManualLabelAddress(form),
            customs: customs || undefined,
          }),
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error?.message || `Failed to get live carrier rates (${response.status}).`,
        );
      }

      const nextPreview = body?.data?.preview as
        | FulfillmentLabelPreview
        | undefined;
      if (!nextPreview) {
        throw new Error('No label preview was returned.');
      }

      setPreview(nextPreview);
      setCustoms(nextPreview.customs);
      setSelectedShippingServiceId((current) => {
        if (nextPreview.rates.some((rate) => rate.id === current)) {
          return current;
        }

        return nextPreview.selectedShippingServiceId || nextPreview.rates[0]?.id || '';
      });
    } catch (error) {
      setPreview(null);
      setSelectedShippingServiceId('');
      setPreviewError(
        error instanceof Error ? error.message : 'Failed to get live carrier rates.',
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [customs, form, order.orderId]);

  useEffect(() => {
    if (initialPreviewRequested.current) return;
    initialPreviewRequested.current = true;
    void fetchPreview();
  }, [fetchPreview]);

  const selectedRate =
    preview?.rates.find((rate) => rate.id === selectedShippingServiceId) || null;

  const canBuy =
    !loading &&
    !previewLoading &&
    Boolean(selectedRate) &&
    isManualLabelAddressReady(form);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preview) {
      setPreviewError('Refresh live rates before buying the label.');
      return;
    }
    if (!selectedRate) {
      setPreviewError('Select a carrier rate before buying the label.');
      return;
    }

    void onSubmit({
      shippingAddress: normalizeManualLabelAddress(form),
      selectedShippingServiceId: selectedRate.id,
      customs,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-[#0B2E2F]">
          Buy Shipping Label
        </h3>
        <p className="mt-2 text-sm text-[#0B2E2F]/60">
          Review the destination, latest rates, and customs declaration for
          {` ${order.orderNumber}`} before purchasing.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['firstName', 'First name', true],
            ['lastName', 'Last name', true],
            ['email', 'Email', true],
            ['phone', 'Phone', true],
            ['address1', 'Address line 1', true],
            ['address2', 'Address line 2', false],
            ['city', 'City', true],
            ['province', 'State / province', true],
            ['postalCode', 'Postal code', true],
            ['country', 'Country', true],
          ].map(([field, label, required]) => (
            <label
              key={field as string}
              className={`space-y-1.5 text-sm font-medium text-[#0B2E2F] ${
                field === 'address1' || field === 'address2'
                  ? 'sm:col-span-2'
                  : ''
              }`}
            >
              {label}
              <input
                type={field === 'email' ? 'email' : 'text'}
                value={String(form[field as keyof ManualLabelForm] || '')}
                onChange={(e) =>
                  updateField(field as keyof ManualLabelForm, e.target.value)
                }
                required={Boolean(required)}
                minLength={field === 'country' ? 2 : undefined}
                maxLength={field === 'country' ? 2 : undefined}
                className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
              />
            </label>
          ))}
          <label className="space-y-1.5 text-sm font-medium text-[#0B2E2F] sm:col-span-2">
            Notes
            <textarea
              value={form.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-[#0B2E2F]/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[#0B2E2F]">
                Latest live rates
              </h4>
              <p className="mt-0.5 text-xs text-[#0B2E2F]/50">
                Refresh after changing the address or customs values.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchPreview()}
              disabled={previewLoading || loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-xs font-semibold text-[#0B2E2F] transition-colors hover:bg-[#0B2E2F]/5 disabled:opacity-40"
            >
              {previewLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh rates
            </button>
          </div>

          {previewError ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : null}

          {preview &&
          !preview.shippoConfig.configured &&
          !preview.shipengineConfig.configured ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No label provider is fully configured. Shippo missing:
                {' '}
                {preview.shippoConfig.missing.join(', ')}
                . ShipEngine missing:
                {' '}
                {preview.shipengineConfig.missing.join(', ')}
                .
              </span>
            </div>
          ) : null}

          {preview?.rateErrors?.length ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {preview.rateErrors.map((rateError) => (
                <div key={rateError.provider} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {rateError.provider === 'shippo' ? 'Shippo' : 'ShipEngine'}
                    {' '}
                    rates unavailable:
                    {' '}
                    {rateError.message}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {preview?.rates.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {preview.rates.map((rate) => (
                <label
                  key={rate.id}
                  className={`cursor-pointer rounded-xl border bg-white p-3 transition-colors ${
                    selectedShippingServiceId === rate.id
                      ? 'border-[#0B2E2F] ring-1 ring-[#0B2E2F]'
                      : 'border-[#0B2E2F]/10 hover:border-[#0B2E2F]/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="carrier-label-rate"
                    value={rate.id}
                    checked={selectedShippingServiceId === rate.id}
                    onChange={(event) =>
                      setSelectedShippingServiceId(event.target.value)
                    }
                    className="sr-only"
                  />
                  <span className="block text-xs font-semibold text-[#0B2E2F]/60">
                    {formatRateProvider(rate)}
                    {rate.carrier ? ` / ${rate.carrier}` : ''}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-[#0B2E2F]">
                    {rate.name}
                  </span>
                  <span className="mt-2 block text-sm text-[#0B2E2F]/70">
                    {formatRatePrice(rate)}
                    {rate.estimatedDays ? ` · ${rate.estimatedDays}d` : ''}
                  </span>
                </label>
              ))}
            </div>
          ) : previewLoading ? (
            <p className="mt-3 text-xs text-[#0B2E2F]/50">
              Fetching live carrier rates...
            </p>
          ) : (
            <p className="mt-3 text-xs text-[#0B2E2F]/45">
              No rate has been selected yet.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-[#0B2E2F]/10 p-4">
          <h4 className="text-sm font-semibold text-[#0B2E2F]">
            Customs review
          </h4>
          {customs ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 sm:col-span-3">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Description
                </span>
                <input
                  value={customs.description}
                  onChange={(event) =>
                    updateCustomsField('description', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Quantity
                </span>
                <input
                  type="number"
                  min={1}
                  value={customs.quantity}
                  onChange={(event) =>
                    updateCustomsField(
                      'quantity',
                      Number(event.target.value) || 1,
                    )
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Unit weight
                </span>
                <input
                  value={customs.unitWeight}
                  onChange={(event) =>
                    updateCustomsField('unitWeight', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Mass unit
                </span>
                <select
                  value={customs.massUnit}
                  onChange={(event) =>
                    updateCustomsField('massUnit', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                >
                  {['kg', 'g', 'oz', 'lb'].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Net weight
                </span>
                <input
                  value={customs.netWeight}
                  onChange={(event) =>
                    updateCustomsField('netWeight', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Unit value
                </span>
                <input
                  value={customs.unitValueAmount}
                  onChange={(event) =>
                    updateCustomsField('unitValueAmount', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Total value
                </span>
                <input
                  value={customs.valueAmount}
                  onChange={(event) =>
                    updateCustomsField('valueAmount', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Currency
                </span>
                <input
                  value={customs.valueCurrency}
                  maxLength={3}
                  onChange={(event) =>
                    updateCustomsField(
                      'valueCurrency',
                      event.target.value.toUpperCase(),
                    )
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal uppercase outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Origin country
                </span>
                <input
                  value={customs.originCountry}
                  maxLength={2}
                  onChange={(event) =>
                    updateCustomsField(
                      'originCountry',
                      event.target.value.toUpperCase(),
                    )
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal uppercase outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  HS/HTS
                </span>
                <input
                  value={customs.hsCode}
                  onChange={(event) =>
                    updateCustomsField('hsCode', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  ECCN / EAR99
                </span>
                <input
                  value={customs.eccnEar99 || ''}
                  onChange={(event) =>
                    updateCustomsField('eccnEar99', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Certify signer
                </span>
                <input
                  value={customs.certifySigner}
                  onChange={(event) =>
                    updateCustomsField('certifySigner', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Non-delivery
                </span>
                <select
                  value={customs.nonDeliveryOption}
                  onChange={(event) =>
                    updateCustomsField('nonDeliveryOption', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                >
                  <option value="RETURN">RETURN</option>
                  <option value="ABANDON">ABANDON</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Contents type
                </span>
                <select
                  value={customs.contentsType}
                  onChange={(event) =>
                    updateCustomsField('contentsType', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                >
                  <option value="MERCHANDISE">MERCHANDISE</option>
                  <option value="SAMPLE">SAMPLE</option>
                  <option value="GIFT">GIFT</option>
                  <option value="DOCUMENTS">DOCUMENTS</option>
                  <option value="RETURN_MERCHANDISE">RETURN_MERCHANDISE</option>
                  <option value="HUMANITARIAN_DONATION">HUMANITARIAN_DONATION</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Incoterm
                </span>
                <select
                  value={customs.incoterm}
                  onChange={(event) =>
                    updateCustomsField('incoterm', event.target.value)
                  }
                  className="w-full rounded-lg border border-[#0B2E2F]/15 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                >
                  <option value="DDU">DDU</option>
                  <option value="DDP">DDP</option>
                </select>
              </label>
              <label className="space-y-1.5 sm:col-span-3">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Manufacturer notes
                </span>
                <textarea
                  value={customs.manufacturerNotes || ''}
                  onChange={(event) =>
                    updateCustomsField('manufacturerNotes', event.target.value)
                  }
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm font-normal outline-none focus:border-[#0B2E2F]"
                />
              </label>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#0B2E2F]/50">
              No editable customs declaration is required for this label.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[#0B2E2F]/60 transition-colors hover:bg-[#0B2E2F]/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canBuy}
            className="flex items-center gap-2 rounded-lg bg-[#0B2E2F] px-4 py-2 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPin className="size-4" />
            )}
            Buy Label
          </button>
        </div>
      </form>
    </div>
  );
}

function ShipConfirmModal({
  order,
  onConfirm,
  onCancel,
  loading,
}: {
  order: FulfillmentOrderListItem;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[#0B2E2F]">
          Mark as Shipped
        </h3>
        <p className="mt-2 text-sm text-[#0B2E2F]/60">
          This will send the customer a &quot;shipped&quot; email with
          tracking information. This action cannot be undone.
        </p>

        <div className="mt-4 rounded-xl bg-[#0B2E2F]/5 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#0B2E2F]/50">Order</span>
            <span className="font-semibold text-[#0B2E2F]">
              {order.orderNumber}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#0B2E2F]/50">Customer</span>
            <span className="text-[#0B2E2F]">{order.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#0B2E2F]/50">Carrier</span>
            <span className="text-[#0B2E2F]">
              {order.carrier || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#0B2E2F]/50">Tracking</span>
            <span className="font-mono text-xs text-[#0B2E2F]">
              {order.trackingCode || 'N/A'}
            </span>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 rounded border-[#0B2E2F]/30 accent-[#0B2E2F]"
          />
          <span className="text-sm text-[#0B2E2F]">
            Package has been handed to the carrier
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[#0B2E2F]/60 hover:bg-[#0B2E2F]/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex items-center gap-2 rounded-lg bg-[#0B2E2F] px-4 py-2 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Truck className="size-4" />
            )}
            Mark Shipped
          </button>
        </div>
      </div>
    </div>
  );
}

export function FulfillmentActions({ order, onActionComplete, isDev }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShipModal, setShowShipModal] = useState(false);
  const [showManualLabelModal, setShowManualLabelModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback(
    async (action: string) => {
      setLoading(action);
      setError(null);
      try {
        const result = await postAction(order.orderId, action);
        if (
          action === 'retry-label' &&
          result.data?.hasLabel === false &&
          result.data.labelError
        ) {
          setError(result.data.labelError);
        }
        onActionComplete();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Action failed',
        );
      } finally {
        setLoading(null);
        setShowDropdown(false);
      }
    },
    [order.orderId, onActionComplete],
  );

  const handleManualLabel = useCallback(
    async (payload: ManualLabelPayload) => {
      setLoading('manual-label');
      setError(null);
      try {
        await postActionBody(order.orderId, 'manual-label', {
          shippingAddress: payload.shippingAddress,
          selectedShippingServiceId: payload.selectedShippingServiceId,
          customs: payload.customs || undefined,
        });
        setShowManualLabelModal(false);
        onActionComplete();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Action failed',
        );
      } finally {
        setLoading(null);
      }
    },
    [order.orderId, onActionComplete],
  );

  const handleShipConfirm = useCallback(async () => {
    setLoading('mark-shipped');
    setError(null);
    try {
      await postAction(order.orderId, 'mark-shipped');
      setShowShipModal(false);
      onActionComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Action failed',
      );
    } finally {
      setLoading(null);
    }
  }, [order.orderId, onActionComplete]);

  const canPack =
    order.fulfillmentStatus === 'label_ready';
  const canShip =
    order.fulfillmentStatus === 'label_ready' ||
    order.fulfillmentStatus === 'packed';
  const canRetryLabel =
    order.fulfillmentStatus === 'error' &&
    !order.labelUrl &&
    order.fulfillmentProvider === 'shipengine' &&
    (order.paymentStatus === 'finished' || order.paymentStatus === 'paid');
  const canManualLabel =
    order.supportsLabelPurchase &&
    !order.labelUrl &&
    (order.paymentStatus === 'finished' || order.paymentStatus === 'paid');
  const canResendLabel = Boolean(order.labelUrl);
  const canResendShipped =
    order.fulfillmentStatus === 'handed_to_carrier';

  // Dev: show force-payment for orders that haven't paid yet
  const canForcePayment =
    isDev &&
    order.paymentStatus !== 'finished' &&
    order.paymentStatus !== 'paid';
  // Dev: show rerun-processing for paid orders that need reprocessing
  const canRerunProcessing =
    isDev &&
    (order.paymentStatus === 'finished' || order.paymentStatus === 'paid');

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {/* Dev: Force Payment */}
        {canForcePayment ? (
          <button
            onClick={() => handleAction('dev-force-payment')}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg border border-dashed border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40"
            title="DEV: Force payment to finished and run processing pipeline"
          >
            {loading === 'dev-force-payment' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            Force Pay
          </button>
        ) : null}

        {/* Dev: Rerun Processing */}
        {canRerunProcessing ? (
          <button
            onClick={() => handleAction('dev-rerun-processing')}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg border border-dashed border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40"
            title="DEV: Rerun successful order processing pipeline"
          >
            {loading === 'dev-rerun-processing' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Rerun
          </button>
        ) : null}

        {/* Buy label */}
        {canManualLabel ? (
          <button
            onClick={() => setShowManualLabelModal(true)}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-40"
            title="Review latest rates and purchase a label"
          >
            {loading === 'manual-label' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MapPin className="size-3.5" />
            )}
            Buy Label
          </button>
        ) : null}

        {/* Retry Label */}
        {canRetryLabel ? (
          <button
            onClick={() => handleAction('retry-label')}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition-colors disabled:opacity-40"
            title="Retry shipping label purchase"
          >
            {loading === 'retry-label' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Retry Label
          </button>
        ) : null}

        {/* Open label */}
        {order.labelUrl ? (
          <a
            href={order.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg bg-[#0B2E2F]/5 px-2.5 py-1.5 text-xs font-medium text-[#0B2E2F] hover:bg-[#0B2E2F]/10 transition-colors"
            title="Open label PDF"
          >
            <FileText className="size-3.5" />
            Label
          </a>
        ) : null}

        {order.commercialInvoiceUrl ? (
          <a
            href={order.commercialInvoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg bg-[#0B2E2F]/5 px-2.5 py-1.5 text-xs font-medium text-[#0B2E2F] transition-colors hover:bg-[#0B2E2F]/10"
            title="Open commercial invoice"
          >
            <FileText className="size-3.5" />
            Invoice
          </a>
        ) : null}

        {/* Track */}
        {order.publicTrackingUrl ? (
          <a
            href={order.publicTrackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#0B2E2F]/60 hover:bg-[#0B2E2F]/5 hover:text-[#0B2E2F] transition-colors"
            title="Track package"
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}

        {/* Mark Packed */}
        {canPack ? (
          <button
            onClick={() => handleAction('mark-packed')}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-40"
            title="Mark as packed"
          >
            {loading === 'mark-packed' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Package className="size-3.5" />
            )}
            Pack
          </button>
        ) : null}

        {/* Mark Shipped */}
        {canShip ? (
          <button
            onClick={() => setShowShipModal(true)}
            disabled={loading !== null}
            className="flex items-center gap-1 rounded-lg bg-[#0B2E2F] px-2.5 py-1.5 text-xs font-semibold text-[#F4F1EA] hover:bg-[#0B2E2F]/90 transition-colors disabled:opacity-40"
            title="Mark as shipped"
          >
            {loading === 'mark-shipped' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Truck className="size-3.5" />
            )}
            Ship
          </button>
        ) : null}

        {/* Dropdown for resend actions */}
        {(canResendLabel || canResendShipped) ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[#0B2E2F]/40 hover:bg-[#0B2E2F]/5 hover:text-[#0B2E2F] transition-colors"
            >
              <ChevronDown className="size-3.5" />
            </button>
            {showDropdown ? (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-[#0B2E2F]/10 bg-white py-1 shadow-lg">
                  {canResendLabel ? (
                    <button
                      onClick={() =>
                        handleAction('resend-label-email')
                      }
                      disabled={loading !== null}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#0B2E2F] hover:bg-[#0B2E2F]/5 transition-colors disabled:opacity-40"
                    >
                      <Mail className="size-3.5 text-[#0B2E2F]/50" />
                      Resend Label Email
                    </button>
                  ) : null}
                  {canResendShipped ? (
                    <button
                      onClick={() =>
                        handleAction('resend-shipped-email')
                      }
                      disabled={loading !== null}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#0B2E2F] hover:bg-[#0B2E2F]/5 transition-colors disabled:opacity-40"
                    >
                      <Mail className="size-3.5 text-[#0B2E2F]/50" />
                      Resend Shipped Email
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-right text-[11px] text-red-600">
          {error}
        </p>
      ) : null}

      {showShipModal ? (
        <ShipConfirmModal
          order={order}
          onConfirm={handleShipConfirm}
          onCancel={() => setShowShipModal(false)}
          loading={loading === 'mark-shipped'}
        />
      ) : null}

      {showManualLabelModal ? (
        <ManualLabelModal
          order={order}
          onSubmit={handleManualLabel}
          onCancel={() => setShowManualLabelModal(false)}
          loading={loading === 'manual-label'}
        />
      ) : null}
    </>
  );
}
