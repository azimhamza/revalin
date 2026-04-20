'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FulfillmentOrderListItem } from '@/lib/checkout/fulfillment-service';
import { FulfillmentActions } from './fulfillment-actions';

type TabKey =
  | 'label_ready'
  | 'packed'
  | 'handed_to_carrier'
  | 'error'
  | 'all'
  | 'pending';

const TABS: { key: TabKey; label: string; devOnly?: boolean }[] = [
  { key: 'label_ready', label: 'Label Ready' },
  { key: 'packed', label: 'Packed' },
  { key: 'handed_to_carrier', label: 'Shipped' },
  { key: 'error', label: 'Errors' },
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending Payment' },
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
  initialStatus: TabKey;
  isDev?: boolean;
};

export function FulfillmentTable({
  initialOrders,
  initialTotal,
  initialStatus,
  isDev,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(initialStatus);
  const [orders, setOrders] = useState(initialOrders);
  const [total, setTotal] = useState(initialTotal);
  const [isPending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleTabs = TABS.filter((tab) => !tab.devOnly || isDev);

  const switchTab = useCallback(
    (tab: TabKey) => {
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
                </td>
                <td className="px-4 py-3 font-medium text-[#0B2E2F]">
                  {formatCurrency(order.totalAmount, order.currencyCode)}
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
