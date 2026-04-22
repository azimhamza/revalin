'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Package,
  Play,
  Truck,
  Zap,
} from 'lucide-react';
import type { FulfillmentOrderListItem } from '@/lib/checkout/fulfillment-service';

type Props = {
  order: FulfillmentOrderListItem;
  onActionComplete: () => void;
  isDev?: boolean;
};

async function postAction(orderId: string, action: string) {
  const response = await fetch(
    `/api/admin/fulfillment/${encodeURIComponent(orderId)}/${action}`,
    { method: 'POST' },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Action failed (${response.status})`,
    );
  }

  return response.json();
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
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback(
    async (action: string) => {
      setLoading(action);
      setError(null);
      try {
        await postAction(order.orderId, action);
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
    </>
  );
}
