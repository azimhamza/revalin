'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  Truck,
} from 'lucide-react';
import type { CheckoutOrderPublic } from '@/lib/checkout/types';
import { getCheckoutDiscounts } from '@/lib/checkout/pricing';
import { getApiData, readJsonSafely } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Props = {
  initialOrder: CheckoutOrderPublic;
  accessKey: string;
};

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

type OrderStatus = 'processing' | 'shipped' | 'delivered';

function deriveStatus(order: CheckoutOrderPublic): OrderStatus {
  const paymentStatus = order.payment.status;
  const isPaid = paymentStatus === 'finished' || paymentStatus === 'paid';

  if (!isPaid) return 'processing';

  // Use fulfillmentStatus if available
  if (order.fulfillmentStatus === 'handed_to_carrier') return 'shipped';

  // Fallback for pre-migration orders
  if (order.shipengine?.handedToCarrierAt) return 'shipped';

  return 'processing';
}

const STEPS: { key: OrderStatus; label: string; icon: typeof Package }[] = [
  { key: 'processing', label: 'Processing', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

const INACTIVE_PAYMENT_STATUSES = new Set([
  'failed',
  'expired',
  'refunded',
  'cancelled',
  'replaced',
]);

function isInactivePaymentStatus(status: string) {
  return INACTIVE_PAYMENT_STATUSES.has(status.toLowerCase());
}

function describeInactivePaymentStatus(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'replaced') {
    return 'This payment request was replaced by a newer checkout. Start a new checkout to generate a fresh payment link.';
  }

  if (normalized === 'cancelled') {
    return 'This payment request was cancelled before payment completed. Start a new checkout to continue.';
  }

  if (normalized === 'expired') {
    return 'This payment request expired before payment completed. Start a new checkout to generate a fresh payment link.';
  }

  if (normalized === 'refunded') {
    return 'This payment request was refunded and is no longer active. Start a new checkout if you still want to place the order.';
  }

  return 'This payment request is no longer active. Start a new checkout to create a fresh payment link.';
}

function StatusTimeline({ currentStatus }: { currentStatus: OrderStatus }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const isComplete = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-full transition-colors',
                  isComplete
                    ? 'bg-[#0B2E2F] text-[#F4F1EA]'
                    : 'bg-[#0B2E2F]/10 text-[#0B2E2F]/40'
                )}
              >
                <Icon className="size-5" />
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isCurrent ? 'text-[#0B2E2F]' : isComplete ? 'text-[#0B2E2F]/70' : 'text-[#0B2E2F]/40'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  'mx-2 h-0.5 w-12 sm:w-20 rounded-full',
                  idx < currentIdx ? 'bg-[#0B2E2F]' : 'bg-[#0B2E2F]/15'
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function OrderStatusView({ initialOrder, accessKey }: Props) {
  const [order, setOrder] = useState<CheckoutOrderPublic>(initialOrder);
  const status = deriveStatus(order);
  const normalizedPaymentStatus = order.payment.status.toLowerCase();
  const isPaid = order.payment.status === 'finished' || order.payment.status === 'paid';
  const isInactive = isInactivePaymentStatus(order.payment.status);
  const isPartiallyPaid = normalizedPaymentStatus === 'partially_paid';
  const latestCheckoutHref =
    order.payment.supersededByOrderId && order.payment.supersededByAccessKey
      ? `/checkout?order=${encodeURIComponent(order.payment.supersededByOrderId)}&key=${encodeURIComponent(order.payment.supersededByAccessKey)}`
      : null;
  const currentCheckoutHref = `/checkout?order=${encodeURIComponent(order.orderId)}&key=${encodeURIComponent(accessKey)}`;
  const cumulativePaidAmount = Number(order.payment.cumulativePaidAmount || 0);
  const remainingBalanceAmount = Number(order.payment.remainingBalanceAmount || 0);
  const hasPartialBalance = cumulativePaidAmount > 0 && remainingBalanceAmount > 0;
  const orderDiscounts = getCheckoutDiscounts({
    currencyCode: order.currencyCode,
    discounts: order.totals.discounts,
    discountAmount: order.totals.discountAmount?.amount,
    discountCode: order.totals.discountCode,
  });

  // Live polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/checkout/v2/orders/${encodeURIComponent(order.orderId)}?key=${encodeURIComponent(accessKey)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) return;
        const payload = await readJsonSafely(response);
        const data = getApiData<{ order: CheckoutOrderPublic }>(payload);
        if (data?.order) {
          setOrder(data.order);
        }
      } catch {
        // Silent fail
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [order.orderId, accessKey]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
          Order Status
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0B2E2F] sm:text-3xl">
          {order.swell.orderNumber || order.orderId}
        </h1>
        <p className="mt-1 text-sm text-[#0B2E2F]/60">
          {isPaid
            ? 'Thank you for your order.'
            : latestCheckoutHref
              ? 'This payment attempt has a newer checkout continuation.'
              : isInactive
                ? 'This payment request is no longer active.'
                : isPartiallyPaid
                  ? 'We received part of your payment. Complete the remaining balance to finish your order.'
                  : 'Awaiting payment confirmation.'}
        </p>
      </div>

      {/* Status timeline */}
      <div className="rounded-2xl border border-[#0B2E2F]/10 bg-white p-5">
        <div className="flex justify-center">
          <StatusTimeline currentStatus={status} />
        </div>

        {latestCheckoutHref ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">A newer checkout is active for this order.</p>
                <p className="mt-1 leading-6">
                  {hasPartialBalance
                    ? `We’ve credited ${formatCurrency(cumulativePaidAmount, order.currencyCode)} toward this order. ${formatCurrency(remainingBalanceAmount, order.currencyCode)} remains on the latest checkout.`
                    : 'This payment attempt was superseded by a newer checkout. Use the latest checkout to continue payment.'}
                </p>
                <Link
                  href={latestCheckoutHref}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0B2E2F] px-4 py-2.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
                >
                  Continue payment
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : isInactive ? (
          <div className="mt-4 rounded-xl border border-[#B42318]/15 bg-[#FEF3F2] px-4 py-3.5 text-sm text-[#912018]">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {normalizedPaymentStatus === 'replaced'
                    ? 'This payment request was replaced.'
                    : 'This payment request is inactive.'}
                </p>
                <p className="mt-1 leading-6">
                  {describeInactivePaymentStatus(order.payment.status)}
                </p>
                <Link
                  href={`/checkout?retry=${encodeURIComponent(order.orderId)}&key=${encodeURIComponent(accessKey)}`}
                  className="mt-3 inline-flex items-center rounded-xl bg-[#0B2E2F] px-4 py-2.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
                >
                  Start new checkout
                </Link>
              </div>
            </div>
          </div>
        ) : isPartiallyPaid && hasPartialBalance ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Partial payment received.</p>
                <p className="mt-1 leading-6">
                  We&apos;ve credited {formatCurrency(cumulativePaidAmount, order.currencyCode)} of{' '}
                  {formatCurrency(order.totals.totalAmount.amount, order.currencyCode)}.{' '}
                  {formatCurrency(remainingBalanceAmount, order.currencyCode)} remains.
                </p>
                <Link
                  href={currentCheckoutHref}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0B2E2F] px-4 py-2.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
                >
                  Open checkout
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : !isPaid ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            <Clock className="size-4 shrink-0" />
            <p>Payment is still being processed. This page will update automatically.</p>
          </div>
        ) : null}
      </div>

      {/* Tracking */}
      {order.shipengine?.trackingCode ? (
        <div className="rounded-2xl border border-[#0B2E2F]/10 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
            Tracking
          </p>
          {status === 'processing' ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3.5 py-2.5 text-sm text-blue-900">
              <Package className="size-4 shrink-0" />
              <p>Your shipping label has been created. We&apos;ll notify you when your package ships.</p>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[#0B2E2F]/50">Carrier</p>
              <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F]">
                {order.shipengine.carrier || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#0B2E2F]/50">Tracking number</p>
              <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F]">
                {order.shipengine.trackingCode}
              </p>
            </div>
          </div>
          {order.shipengine.publicTrackingUrl ? (
            <a
              href={order.shipengine.publicTrackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0B2E2F] px-4 py-2.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
            >
              Track Package
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Line items */}
      <div className="rounded-2xl border border-[#0B2E2F]/10 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
          Items
        </p>
        <div className="mt-3 space-y-3">
          {order.lines.map(line => (
            <div key={line.id} className="flex gap-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-[#F4F1EA]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={line.imageUrl}
                  alt={line.productTitle}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0B2E2F]">{line.productTitle}</p>
                    <p className="mt-0.5 text-xs text-[#0B2E2F]/55">{line.variantTitle}</p>
                  </div>
                  <p className="text-sm font-semibold text-[#0B2E2F]">
                    {formatCurrency(line.lineTotal.amount, order.currencyCode)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-[#0B2E2F]/50">
                  Qty {line.quantity} &middot;{' '}
                  {formatCurrency(line.unitPrice.amount, order.currencyCode)} each
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-4 border-t border-[#0B2E2F]/10 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#0B2E2F]/60">Subtotal</span>
            <span className="font-medium text-[#0B2E2F]">
              {formatCurrency(order.totals.subtotalAmount.amount, order.currencyCode)}
            </span>
          </div>
          {orderDiscounts.map(discount => (
            <div key={`${discount.kind}:${discount.code || discount.label}`} className="flex justify-between text-sm">
              <span className="text-[#0B2E2F]/60">{discount.label}</span>
              <span className="font-medium text-[#0B2E2F]">
                -{formatCurrency(discount.amount.amount, order.currencyCode)}
              </span>
            </div>
          ))}
          {order.totals.shippingAmount ? (
            <div className="flex justify-between text-sm">
              <span className="text-[#0B2E2F]/60">Shipping</span>
              <span className="font-medium text-[#0B2E2F]">
                {Number(order.totals.shippingAmount.amount) <= 0.009
                  ? 'Free'
                  : formatCurrency(order.totals.shippingAmount.amount, order.currencyCode)}
              </span>
            </div>
          ) : null}
          {order.totals.taxAmount ? (
            <div className="flex justify-between text-sm">
              <span className="text-[#0B2E2F]/60">Tax</span>
              <span className="font-medium text-[#0B2E2F]">
                {formatCurrency(order.totals.taxAmount.amount, order.currencyCode)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-[#0B2E2F]/10 pt-2 text-base">
            <span className="font-semibold text-[#0B2E2F]">Total</span>
            <span className="font-semibold text-[#0B2E2F]">
              {formatCurrency(order.totals.totalAmount.amount, order.currencyCode)}
            </span>
          </div>
          {hasPartialBalance ? (
            <>
              <div className="flex justify-between text-sm text-green-700">
                <span className="font-medium">Amount paid</span>
                <span className="font-semibold">
                  {formatCurrency(cumulativePaidAmount, order.currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-amber-700">
                <span className="font-semibold">Remaining balance</span>
                <span className="font-semibold">
                  {formatCurrency(remainingBalanceAmount, order.currencyCode)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Shipping address */}
      <div className="rounded-2xl border border-[#0B2E2F]/10 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
          Shipping Address
        </p>
        <div className="mt-3 space-y-1 text-sm text-[#0B2E2F]">
          <p className="font-semibold">
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
          </p>
          <p>{order.shippingAddress.address1}</p>
          {order.shippingAddress.address2 ? <p>{order.shippingAddress.address2}</p> : null}
          <p>
            {order.shippingAddress.city}, {order.shippingAddress.province}{' '}
            {order.shippingAddress.postalCode}
          </p>
          <p>{order.shippingAddress.country}</p>
        </div>
      </div>

      {/* Order info */}
      <div className="rounded-2xl border border-[#0B2E2F]/10 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
          Order Details
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[#0B2E2F]/50">Order number</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F]">
              {order.swell.orderNumber || order.orderId}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#0B2E2F]/50">Reference</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F]">{order.orderId}</p>
          </div>
          <div>
            <p className="text-xs text-[#0B2E2F]/50">Date</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F]">
              {formatDate(order.createdAt) || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#0B2E2F]/50">Payment status</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0B2E2F] capitalize">
              {order.payment.status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-[#0B2E2F]/40">
        All products are intended for research use only.
      </p>
    </div>
  );
}
