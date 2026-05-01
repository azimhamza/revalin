'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FulfillmentOrderListItem } from '@/lib/checkout/fulfillment-service';
import { FulfillmentActions } from './fulfillment-actions';

export type FulfillmentTabKey =
  | 'label_ready'
  | 'packed'
  | 'handed_to_carrier'
  | 'error'
  | 'all'
  | 'pending';

const TABS: { key: FulfillmentTabKey; label: string; devOnly?: boolean }[] = [
  { key: 'label_ready', label: 'Label Ready' },
  { key: 'packed', label: 'Packed' },
  { key: 'handed_to_carrier', label: 'Shipped' },
  { key: 'error', label: 'Errors' },
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
];

function formatAge(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCurrency(amount: string, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    label_ready: 'bg-blue-100 text-blue-800',
    packed: 'bg-amber-100 text-amber-800',
    handed_to_carrier: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
  };

  const labels: Record<string, string> = {
    pending: 'Pending',
    label_ready: 'Label Ready',
    packed: 'Packed',
    handed_to_carrier: 'Shipped',
    error: 'Error',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        colors[status || ''] || 'bg-gray-100 text-gray-600',
      )}
    >
      {labels[status || ''] || status || 'Unknown'}
    </span>
  );
}

type Props = {
  initialOrders: FulfillmentOrderListItem[];
  initialTotal: number;
  initialStatus: FulfillmentTabKey;
  isDev?: boolean;
};

type ManualAddressForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  notes: string;
};

type ManualRate = {
  id: string;
  name: string;
  carrier?: string;
  estimatedDays?: number | null;
  price: {
    amount: string;
    currencyCode: string;
  };
};

type ManualQuote = {
  swellOrderId: string;
  orderNumber: string;
  currencyCode: string;
  totalAmount: string;
  subtotalAmount: string;
  itemCount: number;
  rates: ManualRate[];
};

const EMPTY_MANUAL_ADDRESS: ManualAddressForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'US',
  notes: '',
};

export function FulfillmentTable({
  initialOrders,
  initialTotal,
  initialStatus,
  isDev,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FulfillmentTabKey>(initialStatus);
  const [orders, setOrders] = useState(initialOrders);
  const [total, setTotal] = useState(initialTotal);
  const [isPending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualQuote, setManualQuote] = useState<ManualQuote | null>(null);
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [manualForm, setManualForm] = useState({
    swellOrderId: '',
    payoutMethod: '',
    selectedShippingServiceId: '',
    shippingAddress: EMPTY_MANUAL_ADDRESS,
    notes: '',
  });

  useEffect(() => {
    setActiveTab(initialStatus);
    setOrders(initialOrders);
    setTotal(initialTotal);
  }, [initialOrders, initialStatus, initialTotal]);

  const visibleTabs = TABS.filter((tab) => !tab.devOnly || isDev);

  const switchTab = useCallback(
    (tab: FulfillmentTabKey) => {
      setActiveTab(tab);
      startTransition(() => {
        router.push(`/admin/fulfillment?status=${tab}`);
        router.refresh();
      });
    },
    [router],
  );

  const refreshList = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const updateManualField = useCallback(
    (
      field: Exclude<keyof typeof manualForm, 'shippingAddress'>,
      value: string,
    ) => {
      setManualForm((current) => ({
        ...current,
        [field]: value,
      }));
      if (field === 'swellOrderId') {
        setManualQuote(null);
        setManualConfirmed(false);
      }
    },
    [],
  );

  const updateManualAddressField = useCallback(
    (field: keyof ManualAddressForm, value: string) => {
      setManualForm((current) => ({
        ...current,
        shippingAddress: {
          ...current.shippingAddress,
          [field]: value,
        },
      }));
      setManualQuote(null);
      setManualConfirmed(false);
    },
    [],
  );

  const resetManualForm = useCallback(() => {
    setManualForm({
      swellOrderId: '',
      payoutMethod: '',
      selectedShippingServiceId: '',
      shippingAddress: EMPTY_MANUAL_ADDRESS,
      notes: '',
    });
    setManualQuote(null);
    setManualConfirmed(false);
    setManualError(null);
  }, []);

  const quoteManualRates = useCallback(async () => {
    setManualLoading(true);
    setManualError(null);
    setManualQuote(null);
    setManualConfirmed(false);

    try {
      const response = await fetch('/api/admin/fulfillment/manual-order/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swellOrderId: manualForm.swellOrderId,
          shippingAddress: {
            ...manualForm.shippingAddress,
            country: manualForm.shippingAddress.country.trim().toUpperCase(),
          },
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            `Failed to quote ShipEngine rates (${response.status}).`,
        );
      }

      const quote = payload?.data?.quote as ManualQuote | undefined;
      if (!quote?.rates?.length) {
        throw new Error('ShipEngine returned no rates for this order.');
      }

      setManualQuote(quote);
      setManualForm((current) => ({
        ...current,
        selectedShippingServiceId: quote.rates[0]?.id || '',
      }));
    } catch (error) {
      setManualError(
        error instanceof Error
          ? error.message
          : 'Failed to quote ShipEngine rates.',
      );
    } finally {
      setManualLoading(false);
    }
  }, [manualForm.shippingAddress, manualForm.swellOrderId]);

  const submitManualOrder = useCallback(async () => {
    setManualLoading(true);
    setManualError(null);

    try {
      const response = await fetch('/api/admin/fulfillment/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...manualForm,
          shippingAddress: {
            ...manualForm.shippingAddress,
            country: manualForm.shippingAddress.country.trim().toUpperCase(),
          },
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            `Failed to create manual fulfillment (${response.status}).`,
        );
      }

      if (payload?.data?.hasLabel === false && payload.data.labelError) {
        setManualError(payload.data.labelError);
      } else {
        resetManualForm();
        setManualOpen(false);
      }
      refreshList();
    } catch (error) {
      setManualError(
        error instanceof Error
          ? error.message
          : 'Failed to create manual fulfillment.',
      );
    } finally {
      setManualLoading(false);
    }
  }, [manualForm, refreshList, resetManualForm]);

  const copyTracking = useCallback(
    (trackingCode: string, orderId: string) => {
      navigator.clipboard.writeText(trackingCode);
      setCopiedId(orderId);
      setTimeout(() => setCopiedId(null), 2000);
    },
    [],
  );

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-[#0B2E2F]/5 p-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-white text-[#0B2E2F] shadow-sm'
                  : 'text-[#0B2E2F]/50 hover:text-[#0B2E2F]/80',
                tab.devOnly && 'border border-dashed border-orange-300',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={refreshList}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[#0B2E2F]/60 transition-colors hover:bg-[#0B2E2F]/5 hover:text-[#0B2E2F]"
        >
          <RefreshCw
            className={cn('size-3.5', isPending && 'animate-spin')}
          />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-[#0B2E2F]/10 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#0B2E2F]">
              Manual fulfillment
            </h2>
            <p className="mt-1 text-xs text-[#0B2E2F]/50">
              Import a Swell order, quote ShipEngine rates, then buy the label.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualOpen((current) => !current)}
            className="flex items-center gap-1.5 rounded-lg bg-[#0B2E2F] px-3 py-2 text-xs font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
          >
            <Plus className="size-3.5" />
            {manualOpen ? 'Hide form' : 'Add fulfillment'}
          </button>
        </div>

        {manualOpen ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Swell order ID
                </span>
                <input
                  value={manualForm.swellOrderId}
                  onChange={(event) =>
                    updateManualField('swellOrderId', event.target.value)
                  }
                  placeholder="Swell order object ID"
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F]"
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Payment / payout method
                </span>
                <input
                  value={manualForm.payoutMethod}
                  onChange={(event) =>
                    updateManualField('payoutMethod', event.target.value)
                  }
                  placeholder="Manual, Interac, crypto, card..."
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F]"
                />
              </label>

              {[
                ['firstName', 'First name', 'Jane'],
                ['lastName', 'Last name', 'Doe'],
                ['email', 'Email', 'customer@example.com'],
                ['phone', 'Phone', '+1 555 555 5555'],
                ['address1', 'Address line 1', '123 Main St'],
                ['address2', 'Address line 2', 'Suite 100'],
                ['city', 'City', 'New York'],
                ['province', 'State / province', 'NY'],
                ['postalCode', 'Postal code', '10001'],
                ['country', 'Country', 'US'],
              ].map(([field, label, placeholder]) => (
                <label
                  key={field}
                  className={
                    field === 'address1' || field === 'address2'
                      ? 'space-y-1.5 md:col-span-2'
                      : 'space-y-1.5'
                  }
                >
                  <span className="text-xs font-semibold text-[#0B2E2F]/60">
                    {label}
                  </span>
                  <input
                    value={
                      manualForm.shippingAddress[
                        field as keyof ManualAddressForm
                      ]
                    }
                    onChange={(event) =>
                      updateManualAddressField(
                        field as keyof ManualAddressForm,
                        event.target.value,
                      )
                    }
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F]"
                  />
                </label>
              ))}

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-[#0B2E2F]/60">
                  Notes
                </span>
                <input
                  value={manualForm.notes}
                  onChange={(event) =>
                    updateManualField('notes', event.target.value)
                  }
                  placeholder="Optional internal note"
                  className="w-full rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F]"
                />
              </label>
            </div>

            {manualQuote ? (
              <div className="rounded-xl border border-[#0B2E2F]/10 bg-[#0B2E2F]/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#0B2E2F]">
                      {manualQuote.orderNumber}
                    </p>
                    <p className="text-xs text-[#0B2E2F]/50">
                      {manualQuote.itemCount} item
                      {manualQuote.itemCount === 1 ? '' : 's'} ·{' '}
                      {formatCurrency(
                        manualQuote.totalAmount,
                        manualQuote.currencyCode,
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B2E2F]/60">
                    {manualQuote.rates.length} ShipEngine rate
                    {manualQuote.rates.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {manualQuote.rates.map((rate) => (
                    <label
                      key={rate.id}
                      className={cn(
                        'cursor-pointer rounded-xl border bg-white p-3 transition-colors',
                        manualForm.selectedShippingServiceId === rate.id
                          ? 'border-[#0B2E2F] ring-1 ring-[#0B2E2F]'
                          : 'border-[#0B2E2F]/10 hover:border-[#0B2E2F]/30',
                      )}
                    >
                      <input
                        type="radio"
                        name="manual-shipping-rate"
                        value={rate.id}
                        checked={manualForm.selectedShippingServiceId === rate.id}
                        onChange={(event) => {
                          setManualForm((current) => ({
                            ...current,
                            selectedShippingServiceId: event.target.value,
                          }));
                          setManualConfirmed(false);
                        }}
                        className="sr-only"
                      />
                      <span className="block text-xs font-semibold text-[#0B2E2F]/60">
                        {rate.carrier || 'ShipEngine'}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#0B2E2F]">
                        {rate.name}
                      </span>
                      <span className="mt-2 block text-sm text-[#0B2E2F]/70">
                        {formatCurrency(rate.price.amount, rate.price.currencyCode)}
                        {rate.estimatedDays ? ` · ${rate.estimatedDays}d` : ''}
                      </span>
                    </label>
                  ))}
                </div>

                <label className="mt-4 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={manualConfirmed}
                    onChange={(event) => setManualConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 rounded border-[#0B2E2F]/30 accent-[#0B2E2F]"
                  />
                  <span className="text-xs text-[#0B2E2F]/70">
                    I verified the Swell order ID, destination address, and selected ShipEngine rate.
                  </span>
                </label>
              </div>
            ) : null}

            {manualError ? (
              <p className="text-xs text-red-600">{manualError}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={quoteManualRates}
                disabled={
                  manualLoading ||
                  !manualForm.swellOrderId.trim() ||
                  !manualForm.shippingAddress.firstName.trim() ||
                  !manualForm.shippingAddress.lastName.trim() ||
                  !manualForm.shippingAddress.email.trim() ||
                  !manualForm.shippingAddress.phone.trim() ||
                  !manualForm.shippingAddress.address1.trim() ||
                  !manualForm.shippingAddress.city.trim() ||
                  !manualForm.shippingAddress.province.trim() ||
                  !manualForm.shippingAddress.postalCode.trim() ||
                  !manualForm.shippingAddress.country.trim()
                }
                className="flex items-center gap-1.5 rounded-lg border border-[#0B2E2F]/15 px-3 py-2 text-xs font-semibold text-[#0B2E2F] transition-colors hover:bg-[#0B2E2F]/5 disabled:opacity-40"
              >
                {manualLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Get rates
              </button>
              <button
                type="button"
                onClick={submitManualOrder}
                disabled={
                  manualLoading ||
                  !manualQuote ||
                  !manualForm.selectedShippingServiceId ||
                  !manualConfirmed
                }
                className="flex items-center gap-1.5 rounded-lg bg-[#0B2E2F] px-3 py-2 text-xs font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:opacity-40"
              >
                {manualLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Create label
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#0B2E2F]/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#0B2E2F]/10 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/50">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Carrier / Service</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0B2E2F]/5">
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-[#0B2E2F]/40"
                >
                  No orders in this queue.
                </td>
              </tr>
            ) : null}
            {orders.map((order) => (
              <tr
                key={order.orderId}
                className="hover:bg-[#0B2E2F]/[0.02] transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#0B2E2F]">
                    {order.orderNumber}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#0B2E2F]/40 font-mono">
                    {order.orderId.slice(0, 12)}...
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[#0B2E2F]">
                    {order.customerName}
                  </p>
                  <p className="text-[11px] text-[#0B2E2F]/40">
                    {order.email}
                  </p>
                  <p
                    className="mt-1 max-w-[220px] truncate text-[11px] text-[#0B2E2F]/45"
                    title={[
                      order.shippingAddress.address1,
                      order.shippingAddress.address2,
                      order.shippingAddress.city,
                      order.shippingAddress.province,
                      order.shippingAddress.postalCode,
                      order.shippingAddress.country,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  >
                    {[
                      order.shippingAddress.address1,
                      order.shippingAddress.city,
                      order.shippingAddress.province,
                      order.shippingAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'No address'}
                  </p>
                </td>
                <td className="px-4 py-3 font-medium text-[#0B2E2F]">
                  {formatCurrency(order.totalAmount, order.currencyCode)}
                  {order.payoutMethod ? (
                    <p className="mt-0.5 text-[11px] font-normal text-[#0B2E2F]/45">
                      {order.payoutMethod}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[#0B2E2F]/60">
                  {order.itemCount}
                </td>
                <td className="px-4 py-3">
                  <p className="text-[#0B2E2F]">
                    {order.carrier || 'N/A'}
                  </p>
                  <p className="text-[11px] text-[#0B2E2F]/40">
                    {order.service || ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {order.trackingCode ? (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-[#0B2E2F]">
                        {order.trackingCode.slice(0, 16)}
                        {order.trackingCode.length > 16 ? '...' : ''}
                      </span>
                      <button
                        onClick={() =>
                          copyTracking(
                            order.trackingCode!,
                            order.orderId,
                          )
                        }
                        className="ml-1 text-[#0B2E2F]/40 hover:text-[#0B2E2F] transition-colors"
                        title="Copy tracking number"
                      >
                        {copiedId === order.orderId ? (
                          <Check className="size-3.5 text-green-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[#0B2E2F]/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.fulfillmentStatus} />
                  {order.labelError ? (
                    <p className="mt-1 text-[11px] text-red-600 max-w-[200px] truncate" title={order.labelError}>
                      {order.labelError}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[#0B2E2F]/50">
                  {formatAge(order.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <FulfillmentActions
                    order={order}
                    onActionComplete={refreshList}
                    isDev={isDev}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#0B2E2F]/40 text-center">
        {total} order{total === 1 ? '' : 's'} total
      </p>
    </div>
  );
}
