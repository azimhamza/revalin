import Link from 'next/link';
import { Fragment } from 'react';
import { AdminPanel, AdminSectionHeader, AdminStatCard } from '@/app/admin/_components/admin-shell';
import {
  listAdminBankfulInvoices,
  type AdminPaymentInvoice,
} from '@/lib/checkout/bankful-invoice-service';
import { formatPrice } from '@/lib/swell/utils';

export const metadata = {
  title: 'Invoices | Revalin Admin',
};

type AdminInvoicesPageProps = {
  searchParams?: Promise<{
    status?: string | string[] | undefined;
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(date);
}

function statusLabel(invoice: AdminPaymentInvoice) {
  if (invoice.status === 'order_created') return 'Order created';
  if (invoice.status === 'paid_order_creation_failed') return 'Paid, order failed';
  if (invoice.status === 'review_required') return 'Review required';
  return invoice.status.replace(/_/g, ' ');
}

function invoiceSortLink(status: string, label: string, active: boolean) {
  return (
    <Link
      key={status}
      href={status === 'all' ? '/admin/invoices' : `/admin/invoices?status=${status}`}
      className={`${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      } inline-flex min-h-7 items-center rounded-none border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-colors`}
    >
      {label}
    </Link>
  );
}

function formatSquareMoney(money?: { amount?: number | null; currency?: string | null } | null) {
  if (!money || typeof money.amount !== 'number') return '—';
  return formatPrice((money.amount / 100).toFixed(2), money.currency || 'CAD');
}

function diagnosticsOrderQuery(invoice: AdminPaymentInvoice) {
  return invoice.orderNumber || invoice.orderId || invoice.invoiceId;
}

function ProviderSummary({ invoice }: { invoice: AdminPaymentInvoice }) {
  if (invoice.provider === 'square') {
    return (
      <>
        <p className="break-all text-[10px]">Square order: {invoice.square?.squareOrderId || '—'}</p>
        <p className="mt-1 break-all text-[10px] text-muted-foreground">Payment: {invoice.square?.paymentId || '—'}</p>
      </>
    );
  }

  return (
    <>
      <p className="break-all text-[10px]">Record: {invoice.bankful?.recordId || '—'}</p>
      <p className="mt-1 break-all text-[10px] text-muted-foreground">Order: {invoice.bankful?.orderId || '—'}</p>
    </>
  );
}

function DetailBlock({ invoice }: { invoice: AdminPaymentInvoice }) {
  const bankful = invoice.bankful || {};
  const square = (invoice.square || {}) as Partial<NonNullable<AdminPaymentInvoice['square']>>;
  const swell = invoice.swell || {};
  const diagnosticsQuery = diagnosticsOrderQuery(invoice);

  return (
    <details className="rounded-none border border-border/70 bg-background/80 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Details
      </summary>
      <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
        <div>
          <p className="font-semibold">Line items</p>
          <div className="mt-1 space-y-1 text-muted-foreground">
            {invoice.lines.map((line) => (
              <p key={line.id}>
                {line.productTitle} {line.variantTitle ? `(${line.variantTitle})` : ''} x{line.quantity} · {formatPrice(line.lineTotal.amount, line.lineTotal.currencyCode)}
              </p>
            ))}
          </div>
        </div>
        <div>
          <p className="font-semibold">Customer</p>
          <div className="mt-1 space-y-1 text-muted-foreground">
            <p>{invoice.shippingAddress.firstName} {invoice.shippingAddress.lastName}</p>
            <p>{invoice.shippingAddress.email}</p>
            <p>{invoice.shippingAddress.address1}</p>
            <p>{invoice.shippingAddress.city}, {invoice.shippingAddress.province} {invoice.shippingAddress.postalCode}</p>
            <p>{invoice.shippingAddress.country}</p>
          </div>
        </div>
        <div>
          <p className="font-semibold">Provider IDs</p>
          <div className="mt-1 space-y-1 break-all text-muted-foreground">
            <p>Provider: {invoice.provider}</p>
            {invoice.provider === 'square' ? (
              <>
                <p>Payment link: {square.paymentLinkId || '—'}</p>
                <p>Square order: {square.squareOrderId || '—'}</p>
                <p>Square payment: {square.paymentId || '—'}</p>
                <p>Square status: {square.squareStatus || '—'}</p>
                <p>Location: {square.locationId || '—'}</p>
              </>
            ) : (
              <>
                <p>Attempt: {invoice.attemptId}</p>
                <p>Request: {bankful.requestId || '—'}</p>
                <p>Record: {bankful.recordId || '—'}</p>
                <p>Bankful order: {bankful.orderId || '—'}</p>
              </>
            )}
            <p>Swell order: {swell.orderNumber || swell.orderId || '—'}</p>
            <p>Swell payment: {swell.paymentId || '—'}</p>
          </div>
        </div>
      </div>
      {invoice.provider === 'square' ? (
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
          <div>
            <p className="font-semibold">Square amount check</p>
            <div className="mt-1 space-y-1 text-muted-foreground">
              <p>Expected: {formatPrice(square.expectedAmount || invoice.amount, square.expectedCurrency || invoice.currencyCode)}</p>
              <p>Amount money: {formatSquareMoney(square.amountMoney)}</p>
              <p>Total money: {formatSquareMoney(square.totalMoney)}</p>
            </div>
          </div>
          <div>
            <p className="font-semibold">Square lifecycle</p>
            <div className="mt-1 space-y-1 text-muted-foreground">
              <p>Created: {formatDateTime(square.createdAt)}</p>
              <p>Updated: {formatDateTime(square.updatedAt)}</p>
              <p>Paid: {formatDateTime(square.paidAt)}</p>
              <p>Deleted: {formatDateTime(square.deletedAt)}</p>
            </div>
          </div>
          <div>
            <p className="font-semibold">Links</p>
            <div className="mt-1 space-y-1 break-all text-muted-foreground">
              {square.checkoutUrl ? (
                <p><a className="underline underline-offset-2" href={square.checkoutUrl} target="_blank" rel="noreferrer">Square checkout</a></p>
              ) : null}
              {square.receiptUrl ? (
                <p><a className="underline underline-offset-2" href={square.receiptUrl} target="_blank" rel="noreferrer">Square receipt</a></p>
              ) : null}
              <p>
                <Link className="underline underline-offset-2" href={`/admin/payment-diagnostics?order=${encodeURIComponent(diagnosticsQuery)}`}>
                  Run payment diagnostics
                </Link>
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {invoice.latestError || bankful.errorMessage || square.deletionError ? (
        <div className="mt-3 rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {invoice.latestError || bankful.errorMessage || square.deletionError}
        </div>
      ) : null}
    </details>
  );
}

export default async function AdminInvoicesPage({
  searchParams,
}: AdminInvoicesPageProps) {
  const params = (await searchParams) || {};
  const requestedStatus = firstParam(params.status);
  const status = ['all', 'paid', 'pending', 'failed', 'review'].includes(requestedStatus || '')
    ? (requestedStatus as 'all' | 'paid' | 'pending' | 'failed' | 'review')
    : 'all';
  const result = await listAdminBankfulInvoices({
    status,
    page: 1,
    pageSize: 100,
  });
  const reviewCount = result.data.filter(
    (invoice) => {
      const normalizedStatus = invoice.status.toLowerCase();
      return (
        ['paid', 'pending', 'capture_pending', 'capture_unknown', 'paid_order_creation_failed', 'review_required'].includes(normalizedStatus) ||
        Boolean(invoice.latestError) ||
        Boolean(invoice.square?.deletionError)
      );
    },
  ).length;
  const paidCount = result.data.filter(
    (invoice) => ['paid', 'finished', 'order_created'].includes(invoice.status.toLowerCase()),
  ).length;
  const failedCount = result.data.filter(
    (invoice) => ['failed', 'declined', 'cancelled', 'expired', 'replaced'].includes(invoice.status.toLowerCase()),
  ).length;

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Card payments"
        title="Invoices"
        description="Internal invoice snapshots and provider diagnostics for Bankful and Square card payments."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <AdminStatCard label="Visible" value={result.total} detail="Rows in current filter" />
        <AdminStatCard label="Paid" value={paidCount} detail="Created order or captured" />
        <AdminStatCard label="Review" value={reviewCount} detail="Pending or paid without order" />
        <AdminStatCard label="Failed" value={failedCount} detail="Declined or failed captures" />
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['all', 'All'],
          ['paid', 'Paid'],
          ['pending', 'Pending'],
          ['failed', 'Failed'],
          ['review', 'Review'],
        ].map(([key, label]) => invoiceSortLink(key, label, status === key))}
      </div>

      <AdminPanel>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-2 py-2 font-semibold">Invoice</th>
                <th className="px-2 py-2 font-semibold">Customer</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold">Provider</th>
                <th className="px-2 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {result.data.map((invoice) => (
                <Fragment key={`${invoice.source}:${invoice.attemptId}`}>
                  <tr className="align-top">
                    <td className="px-2 py-3">
                      <p className="font-semibold">{invoice.orderNumber || invoice.orderId || invoice.attemptId}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{invoice.source === 'order' ? 'Order' : 'Attempt'} · {invoice.provider}</p>
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-semibold">{invoice.shippingAddress.firstName} {invoice.shippingAddress.lastName}</p>
                      <p className="mt-1 break-all text-[10px] text-muted-foreground">{invoice.email || invoice.shippingAddress.email}</p>
                    </td>
                    <td className="px-2 py-3">
                      <span className="inline-flex rounded-none border border-border bg-background px-2 py-1 text-[10px] font-semibold capitalize">
                        {statusLabel(invoice)}
                      </span>
                      {invoice.fulfillmentStatus ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">{invoice.fulfillmentStatus}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 font-semibold">
                      {formatPrice(invoice.totals.totalAmount.amount, invoice.totals.totalAmount.currencyCode)}
                      <p className="mt-1 text-[10px] font-normal text-muted-foreground">{invoice.lines.length} line{invoice.lines.length === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-2 py-3">
                      <ProviderSummary invoice={invoice} />
                      {invoice.orderId ? (
                        <Link
                          href={`/admin/payment-diagnostics?order=${encodeURIComponent(diagnosticsOrderQuery(invoice))}`}
                          className="mt-1 inline-flex text-[10px] font-semibold text-[#0B2E2F] underline underline-offset-2"
                        >
                          Diagnostics
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-[10px] text-muted-foreground">
                      {formatDateTime(invoice.updatedAt)}
                    </td>
                  </tr>
                  <tr className="bg-muted/20">
                    <td colSpan={6} className="px-2 pb-3 pt-0">
                      <DetailBlock invoice={invoice} />
                    </td>
                  </tr>
                </Fragment>
              ))}
              {result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-sm text-muted-foreground">
                    No card invoices found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}
