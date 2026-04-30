'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Wallet, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getApiData, readJsonSafely } from '@/lib/api/client';
import {
  clearStoredCheckoutResume,
  clearStoredCheckoutResumeDismissal,
  isCheckoutResumeExpired,
  persistCheckoutResume,
  persistCheckoutResumeDismissal,
  readStoredCheckoutResume,
  readStoredCheckoutResumeDismissal,
  type CheckoutResume,
  type CheckoutResumeDismissal,
} from '@/lib/checkout/client-resume';
import {
  SHIELDCLIMB_PUBLIC_POLLING_ID,
  isTerminalPaymentStatus,
} from '@/lib/checkout/constants';
import type { CheckoutOrderPublic } from '@/lib/checkout/types';
import { cn } from '@/lib/utils';

const BACKGROUND_RECOVERY_INTERVAL_MS = 12000;
const INACTIVE_PAYMENT_STATUSES = new Set([
  'failed',
  'expired',
  'refunded',
  'cancelled',
  'replaced',
]);

type ActiveRecoveredCheckout = {
  order: CheckoutOrderPublic;
  accessKey: string;
  snapshotKey: string;
};

function isInactivePaymentStatus(status: string) {
  return INACTIVE_PAYMENT_STATUSES.has(status.trim().toLowerCase());
}

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function shouldHidePendingBanner(pathname: string | null) {
  if (!pathname) return true;
  if (pathname.startsWith('/checkout')) return true;
  if (pathname.startsWith('/order/')) return true;
  return false;
}

function buildResume(order: CheckoutOrderPublic, accessKey: string): CheckoutResume {
  return {
    version: 1,
    orderId: order.orderId,
    accessKey,
    provider: order.payment.provider,
    status: order.payment.status,
    savedAt: new Date().toISOString(),
    updatedAt: order.updatedAt,
  };
}

function buildBannerSnapshotKey(order: CheckoutOrderPublic, accessKey: string) {
  return [
    order.orderId,
    accessKey,
    order.payment.status.trim().toLowerCase(),
    order.updatedAt || '',
  ].join(':');
}

function getPollingId(payment: CheckoutOrderPublic['payment']) {
  if (payment.provider === 'shieldclimb') {
    return SHIELDCLIMB_PUBLIC_POLLING_ID;
  }

  if (payment.provider === 'nowpayments') {
    return payment.paymentId;
  }

  if (payment.provider === 'interac') {
    return payment.messageCode || 'interac';
  }

  return undefined;
}

async function fetchCheckoutOrder(orderId: string, accessKey: string) {
  const response = await fetch(
    `/api/checkout/v2/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(accessKey)}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    return null;
  }

  const payload = await readJsonSafely(response);
  return getApiData<{ order: CheckoutOrderPublic }>(payload)?.order ?? null;
}

async function refreshCheckoutPayment(
  order: CheckoutOrderPublic,
  accessKey: string,
) {
  const pollingId = getPollingId(order.payment);
  if (!pollingId) {
    return order;
  }

  const response = await fetch(
    `/api/checkout/v2/payments/${encodeURIComponent(
      pollingId,
    )}/status?orderId=${encodeURIComponent(order.orderId)}&key=${encodeURIComponent(accessKey)}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    return order;
  }

  const payload = await readJsonSafely(response);
  return getApiData<{ order: CheckoutOrderPublic }>(payload)?.order ?? order;
}

async function resolveLatestCheckoutOrder(resume: CheckoutResume) {
  let currentOrderId = resume.orderId;
  let currentAccessKey = resume.accessKey;

  for (let depth = 0; depth < 4; depth += 1) {
    const order = await fetchCheckoutOrder(currentOrderId, currentAccessKey);
    if (!order) {
      return null;
    }

    const supersededByOrderId = order.payment.supersededByOrderId?.trim();
    const supersededByAccessKey = order.payment.supersededByAccessKey?.trim();

    if (
      !supersededByOrderId ||
      !supersededByAccessKey ||
      (supersededByOrderId === currentOrderId &&
        supersededByAccessKey === currentAccessKey)
    ) {
      return {
        order,
        accessKey: currentAccessKey,
      };
    }

    currentOrderId = supersededByOrderId;
    currentAccessKey = supersededByAccessKey;
  }

  return null;
}

function showPaymentConfirmedToast(args: {
  order: CheckoutOrderPublic;
  accessKey: string;
  router: ReturnType<typeof useRouter>;
}) {
  toast.success('Payment confirmed', {
    id: `checkout-recovery-paid-${args.order.orderId}`,
    description:
      'Your order finished processing in the background. You can open the order page anytime.',
    icon: <CheckCircle2 className="size-4 text-[#0B2E2F]" />,
    action: {
      label: 'View order',
      onClick: () =>
        args.router.push(
          `/order/${encodeURIComponent(args.order.orderId)}?key=${encodeURIComponent(
            args.accessKey,
          )}`,
        ),
    },
    style: {
      background: '#F4F1EA',
      border: '1px solid rgba(11, 46, 47, 0.12)',
      color: '#0B2E2F',
      boxShadow: '0 20px 48px rgba(11, 46, 47, 0.12)',
    },
    classNames: {
      toast: 'rounded-[22px]',
      title: 'text-sm font-semibold tracking-[-0.015em]',
      description: 'text-xs leading-5 text-[#0B2E2F]/70',
      actionButton:
        '!rounded-full !border-0 !px-3.5 !py-2 !text-xs !font-semibold !shadow-none',
    },
    actionButtonStyle: {
      background: '#0B2E2F',
      color: '#F4F1EA',
    },
  });
}

export function CheckoutRecoveryMonitor() {
  const pathname = usePathname();
  const router = useRouter();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const isRecoveringRef = useRef(false);
  const [activeCheckout, setActiveCheckout] =
    useState<ActiveRecoveredCheckout | null>(null);
  const [dismissal, setDismissal] =
    useState<CheckoutResumeDismissal | null>(() =>
      typeof window === 'undefined'
        ? null
        : readStoredCheckoutResumeDismissal(),
    );

  const shouldHideBanner = shouldHidePendingBanner(pathname);
  const isPartiallyPaid =
    activeCheckout?.order.payment.status.trim().toLowerCase() ===
    'partially_paid';
  const bannerDismissed =
    activeCheckout &&
    dismissal?.snapshotKey === activeCheckout.snapshotKey;

  const resumeHref = activeCheckout
    ? `/checkout?order=${encodeURIComponent(
        activeCheckout.order.orderId,
      )}&key=${encodeURIComponent(activeCheckout.accessKey)}`
    : null;

  const amountSummary = useMemo(() => {
    if (!activeCheckout || !isPartiallyPaid) {
      return null;
    }

    const paid = Number(activeCheckout.order.payment.cumulativePaidAmount || 0);
    const remaining = Number(
      activeCheckout.order.payment.remainingBalanceAmount || 0,
    );

    if (!(paid > 0) && !(remaining > 0)) {
      return null;
    }

    return {
      paid: formatCurrency(paid, activeCheckout.order.currencyCode),
      remaining: formatCurrency(remaining, activeCheckout.order.currencyCode),
    };
  }, [activeCheckout, isPartiallyPaid]);

  const recoverCheckout = useCallback(async () => {
    if (isRecoveringRef.current) {
      return;
    }

    const resume = readStoredCheckoutResume();
    if (!resume) {
      setActiveCheckout(null);
      return;
    }

    if (isCheckoutResumeExpired(resume)) {
      clearStoredCheckoutResume();
      clearStoredCheckoutResumeDismissal();
      setDismissal(null);
      setActiveCheckout(null);
      return;
    }

    if (
      isTerminalPaymentStatus(resume.status) ||
      isInactivePaymentStatus(resume.status)
    ) {
      clearStoredCheckoutResume();
      clearStoredCheckoutResumeDismissal();
      setDismissal(null);
      setActiveCheckout(null);
      return;
    }

    isRecoveringRef.current = true;

    try {
      let resolved = await resolveLatestCheckoutOrder(resume);

      if (!resolved) {
        clearStoredCheckoutResume();
        clearStoredCheckoutResumeDismissal();
        setDismissal(null);
        setActiveCheckout(null);
        return;
      }

      let order = resolved.order;
      let accessKey = resolved.accessKey;

      if (
        !isTerminalPaymentStatus(order.payment.status) &&
        !isInactivePaymentStatus(order.payment.status)
      ) {
        order = await refreshCheckoutPayment(order, accessKey);

        const nextOrderId = order.payment.supersededByOrderId?.trim();
        const nextAccessKey = order.payment.supersededByAccessKey?.trim();

        if (
          nextOrderId &&
          nextAccessKey &&
          (nextOrderId !== order.orderId || nextAccessKey !== accessKey)
        ) {
          persistCheckoutResume({
            ...buildResume(order, accessKey),
            orderId: nextOrderId,
            accessKey: nextAccessKey,
          });

          resolved = await resolveLatestCheckoutOrder({
            ...resume,
            orderId: nextOrderId,
            accessKey: nextAccessKey,
          });

          if (!resolved) {
            clearStoredCheckoutResume();
            clearStoredCheckoutResumeDismissal();
            setDismissal(null);
            setActiveCheckout(null);
            return;
          }

          order = resolved.order;
          accessKey = resolved.accessKey;
        }
      }

      if (isInactivePaymentStatus(order.payment.status)) {
        clearStoredCheckoutResume();
        clearStoredCheckoutResumeDismissal();
        setDismissal(null);
        setActiveCheckout(null);
        return;
      }

      if (
        !isTerminalPaymentStatus(resume.status) &&
        isTerminalPaymentStatus(order.payment.status)
      ) {
        clearStoredCheckoutResume();
        clearStoredCheckoutResumeDismissal();
        setDismissal(null);
        setActiveCheckout(null);
        showPaymentConfirmedToast({ order, accessKey, router });
        return;
      }

      const nextResume = buildResume(order, accessKey);
      persistCheckoutResume(nextResume);
      setActiveCheckout({
        order,
        accessKey,
        snapshotKey: buildBannerSnapshotKey(order, accessKey),
      });
    } catch {
      // Best effort only. Checkout pages still have their own direct recovery path.
    } finally {
      isRecoveringRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (shouldHideBanner) {
      return;
    }

    void recoverCheckout();

    const interval = window.setInterval(() => {
      void recoverCheckout();
    }, BACKGROUND_RECOVERY_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [recoverCheckout, shouldHideBanner]);

  useEffect(() => {
    const root = document.documentElement;

    if (
      shouldHideBanner ||
      !activeCheckout ||
      bannerDismissed ||
      !bannerRef.current
    ) {
      root.style.setProperty('--revalin-pending-banner-height', '0px');
      return;
    }

    const updateHeight = () => {
      root.style.setProperty(
        '--revalin-pending-banner-height',
        `${bannerRef.current?.offsetHeight ?? 0}px`,
      );
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(bannerRef.current);

    return () => {
      observer.disconnect();
      root.style.setProperty('--revalin-pending-banner-height', '0px');
    };
  }, [activeCheckout, bannerDismissed, shouldHideBanner]);

  const handleDismiss = useCallback(() => {
    if (!activeCheckout) {
      return;
    }

    const nextDismissal: CheckoutResumeDismissal = {
      version: 1,
      snapshotKey: activeCheckout.snapshotKey,
      dismissedAt: new Date().toISOString(),
    };

    persistCheckoutResumeDismissal(nextDismissal);
    setDismissal(nextDismissal);
  }, [activeCheckout]);

  if (
    shouldHideBanner ||
    !activeCheckout ||
    bannerDismissed ||
    !resumeHref
  ) {
    return null;
  }

  const orderLabel =
    activeCheckout.order.swell.orderNumber || activeCheckout.order.orderId;

  return (
    <div
      ref={bannerRef}
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl',
        isPartiallyPaid
          ? 'border-amber-200/80 bg-[#FFF4DE]/95 text-[#0B2E2F]'
          : 'border-[#0B2E2F]/10 bg-[#F4F1EA]/95 text-[#0B2E2F]',
      )}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/55">
            {isPartiallyPaid ? (
              <Wallet className="size-3.5" />
            ) : (
              <Clock3 className="size-3.5" />
            )}
            <span>
              {isPartiallyPaid ? 'Partial payment received' : 'Pending checkout'}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <p className="truncate text-sm font-semibold tracking-[-0.015em] md:text-[15px]">
              {isPartiallyPaid
                ? `Continue payment for ${orderLabel}`
                : `Resume checkout for ${orderLabel}`}
            </p>
            <p className="text-xs leading-5 text-[#0B2E2F]/70 md:text-[13px]">
              {isPartiallyPaid && amountSummary
                ? `${amountSummary.paid} paid • ${amountSummary.remaining} left`
                : 'Your latest checkout is still active.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <Button
            asChild
            size="sm"
            className="h-10 rounded-full px-4 text-sm"
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            <Link href={resumeHref}>
              {isPartiallyPaid ? 'Continue payment' : 'Continue checkout'}
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss pending checkout"
            className="size-10 rounded-full border border-[#0B2E2F]/10 text-[#0B2E2F]/60 hover:bg-[#0B2E2F]/5 hover:text-[#0B2E2F]"
            onClick={handleDismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
