'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { IntentLink } from '@/components/navigation/intent-link';
import { cn } from '@/lib/utils';
import type {
  PaymentDiagnosticResult,
  PaymentDiagnosticSeverity,
} from '@/lib/checkout/payment-diagnostics';
import {
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from '../../_components/admin-shell';

type Props = {
  initialOrder: string;
};

type ApiPayload = {
  data?: PaymentDiagnosticResult;
  error?: {
    message?: string;
  };
};

const severityStyles: Record<PaymentDiagnosticSeverity, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
  neutral: 'border-border bg-muted/50 text-foreground',
};

const severityIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Circle,
} satisfies Record<PaymentDiagnosticSeverity, typeof Circle>;

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatCurrency(amount?: string | number | null, currencyCode?: string | null) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return '-';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
      minimumFractionDigits: 2,
    }).format(parsed);
  } catch {
    return `${parsed.toFixed(2)} ${currencyCode || ''}`.trim();
  }
}

function ValueRow({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-xs text-foreground">
        {value === null || value === undefined || value === '' ? '-' : String(value)}
      </dd>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto border border-border/70 bg-background p-2 text-[11px] leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StatusPill({
  status,
  children,
}: {
  status: PaymentDiagnosticSeverity;
  children: string;
}) {
  const Icon = severityIcons[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
        severityStyles[status],
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  );
}

export function PaymentDiagnosticsPanel({ initialOrder }: Props) {
  const [query, setQuery] = useState(initialOrder);
  const [lastQuery, setLastQuery] = useState(initialOrder);
  const [result, setResult] = useState<PaymentDiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setError('Enter a Swell order number or internal checkout order id.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setLastQuery(normalized);

    try {
      const response = await fetch(
        `/api/admin/payments/diagnostics?order=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;

      if (!response.ok) {
        throw new Error(
          payload?.error?.message || `Payment diagnostic failed (${response.status}).`,
        );
      }

      setResult(payload?.data ?? null);
      const url = new URL(window.location.href);
      url.searchParams.set('order', normalized);
      window.history.replaceState(null, '', url.toString());
    } catch (nextError) {
      setResult(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to run payment diagnostics.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialOrder.trim()) {
      void runCheck(initialOrder);
    }
  }, [initialOrder, runCheck]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void runCheck(query);
    },
    [query, runCheck],
  );

  const providerRawEntries = useMemo(
    () => Object.entries(result?.provider?.raw ?? {}),
    [result?.provider?.raw],
  );
  const paymentEntries = useMemo(
    () => Object.entries(result?.payment ?? {}),
    [result?.payment],
  );

  return (
    <div className="space-y-3">
      <AdminPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <AdminSectionHeader
            eyebrow="Payments"
            title="Payment Diagnostics"
            description="Check where a payment fell through by combining local checkout state, provider status, Swell payments, callbacks, and OpenPanel telemetry."
          />
          <form onSubmit={onSubmit} className="flex w-full gap-2 lg:max-w-md">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="100069 or RVL-..."
                className="h-9 w-full rounded-none border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </label>
            <button className={adminPrimaryButtonClass} disabled={loading} type="submit">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Check
            </button>
          </form>
        </div>
      </AdminPanel>

      {error ? (
        <AdminPanel className="border-red-200 bg-red-50 text-red-900">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" />
            {error}
          </div>
        </AdminPanel>
      ) : null}

      {result ? (
        <>
          <AdminPanel className={cn('border', severityStyles[result.verdict.status])}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <StatusPill status={result.verdict.status}>{result.verdict.label}</StatusPill>
                <p className="max-w-4xl text-sm leading-6">{result.verdict.detail}</p>
              </div>
              <button
                className={adminSecondaryButtonClass}
                type="button"
                disabled={loading}
                onClick={() => void runCheck(lastQuery)}
              >
                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                Recheck
              </button>
            </div>
          </AdminPanel>

          {result.order ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AdminStatCard
                label="Swell order"
                value={result.order.orderNumber}
                detail={result.order.orderId}
                size="compact"
              />
              <AdminStatCard
                label="Payment"
                value={result.order.localPaymentStatus || '-'}
                detail={`${result.order.provider} / ${result.order.paymentMethod || '-'}`}
                size="compact"
              />
              <AdminStatCard
                label="Total"
                value={formatCurrency(result.order.totalAmount, result.order.currencyCode)}
                detail={`${result.order.itemCount} item${result.order.itemCount === 1 ? '' : 's'}`}
                size="compact"
              />
              <AdminStatCard
                label="Customer"
                value={result.order.customerName || '-'}
                detail={result.order.email || '-'}
                size="compact"
              />
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <AdminPanel>
              <AdminSectionHeader
                eyebrow="Timeline"
                title="Payment Path"
                description="Each row is a point where the checkout either advanced or stopped."
                className="mb-2"
              />
              <div className="divide-y divide-border/60 border border-border/70 bg-background">
                {result.timeline.length ? (
                  result.timeline.map((item) => {
                    const Icon = severityIcons[item.status];

                    return (
                      <div key={`${item.label}-${item.at || ''}`} className="grid gap-2 p-3 sm:grid-cols-[10rem_1fr]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                'size-4',
                                item.status === 'success' && 'text-emerald-600',
                                item.status === 'warning' && 'text-amber-600',
                                item.status === 'danger' && 'text-red-600',
                                item.status === 'neutral' && 'text-muted-foreground',
                              )}
                            />
                            <p className="text-xs font-semibold text-foreground">{item.label}</p>
                          </div>
                          <p className="pl-6 text-[11px] text-muted-foreground">
                            {formatDate(item.at)}
                          </p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">{item.detail}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    No timeline available for this query.
                  </p>
                )}
              </div>
            </AdminPanel>

            <AdminPanel>
              <AdminSectionHeader
                eyebrow="Live checks"
                title="Provider and Swell"
                description="Current external status, compared against local checkout state."
                className="mb-2"
              />
              <dl className="border border-border/70 bg-background px-3">
                <ValueRow label="Provider" value={result.provider?.provider} />
                <ValueRow label="Provider status" value={result.provider?.status} />
                <ValueRow label="Provider detail" value={result.provider?.detail} />
                <ValueRow label="Provider error" value={result.provider?.error} />
                <ValueRow label="Swell status" value={result.swell?.status} />
                <ValueRow label="Swell paid" value={result.swell?.paid} />
                <ValueRow label="Swell payment total" value={result.swell?.paymentTotal} />
                <ValueRow label="Swell payments" value={result.swell?.paymentCount} />
              </dl>

              {providerRawEntries.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Provider payload
                  </p>
                  <JsonBlock value={result.provider?.raw} />
                </div>
              ) : null}
            </AdminPanel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <AdminPanel>
              <AdminSectionHeader
                eyebrow="Local"
                title="Checkout Snapshot"
                description="Stored payment fields only; secrets and addresses are omitted."
                className="mb-2"
              />
              <dl className="border border-border/70 bg-background px-3">
                {paymentEntries.length ? (
                  paymentEntries.map(([key, value]) => (
                    <ValueRow key={key} label={key} value={value as string | number | boolean | null} />
                  ))
                ) : (
                  <ValueRow label="Payment" value="No local payment snapshot." />
                )}
              </dl>
            </AdminPanel>

            <AdminPanel>
              <AdminSectionHeader
                eyebrow="OpenPanel"
                title="Telemetry"
                description="Matching checkout_payment_initiated and purchase events for the internal order id."
                className="mb-2"
              />
              {result.analytics.configured ? (
                result.analytics.events.length ? (
                  <div className="divide-y divide-border/60 border border-border/70 bg-background">
                    {result.analytics.events.map((event) => (
                      <div key={`${event.name}-${event.id || event.at || ''}`} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{event.name}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(event.at)}</p>
                        </div>
                        <JsonBlock value={event.properties} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-border/70 bg-background p-3 text-sm text-muted-foreground">
                    OpenPanel is configured, but no matching payment events were found.
                  </div>
                )
              ) : (
                <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  OpenPanel read API is not configured: {result.analytics.missingConfig.join(', ') || 'missing config'}.
                </div>
              )}
            </AdminPanel>
          </div>

          {result.order ? (
            <AdminPanel className="flex flex-wrap items-center gap-2">
              <Clock3 className="size-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Created {formatDate(result.order.createdAt)}. Last local update {formatDate(result.order.updatedAt)}.
              </p>
              <IntentLink
                href={`/admin/fulfillment?status=all`}
                className={cn(adminSecondaryButtonClass, 'ml-auto')}
              >
                <ExternalLink className="size-3.5" />
                Fulfillment
              </IntentLink>
            </AdminPanel>
          ) : null}
        </>
      ) : (
        <AdminPanel className="border-dashed">
          <p className="text-sm text-muted-foreground">
            Enter an order number to run a live diagnostic. Use Swell numbers like 100069 or internal ids like RVL-MOMKIAWE-45JN20.
          </p>
        </AdminPanel>
      )}
    </div>
  );
}
