import Link from 'next/link';
import { AdminPanel, AdminSectionHeader, AdminStatCard } from '@/app/admin/_components/admin-shell';
import {
  listAdminBankfulInvoices,
  type AdminBankfulInvoice,
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

function statusLabel(invoice: AdminBankfulInvoice) {
  if (invoice.status === 'order_created') return 'Order created';
  if (invoice.status === 'paid_order_creation_failed') return 'Paid, order failed';
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

function DetailBlock({ invoice }: { invoice: AdminBankfulInvoice }) {
  const bankful = invoice.bankful || {};
  const swell = invoice.swell || {};

  return (
    <details className="mt-3 rounded-none border border-border/70 bg-background/80 px-3 py-2">
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
            <p>Attempt: {invoice.attemptId}</p>
            <p>Request: {bankful.requestId || '—'}</p>
            <p>Record: {bankful.recordId || '—'}</p>
            <p>Bankful order: {bankful.orderId || '—'}</p>
            <p>Swell order: {swell.orderNumber || swell.orderId || '—'}</p>
            <p>Swell payment: {swell.paymentId || '—'}</p>
          </div>
        </div>
      </div>
      {invoice.latestError || bankful.errorMessage ? (
        <div className="mt-3 rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {invoice.latestError || bankful.errorMessage}
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
    (invoice) =>
      invoice.status === 'paid' ||
      invoice.status === 'pending' ||
      invoice.status === 'capture_pending' ||
      invoice.status === 'capture_unknown' ||
      invoice.status === 'paid_order_creation_failed',
  ).length;
  const paidCount = result.data.filter(
    (invoice) => invoice.status === 'paid' || invoice.status === 'order_created',
  ).length;
  const failedCount = result.data.filter(
    (invoice) => invoice.status === 'failed' || invoice.status === 'declined',
  ).length;

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Bankful"
        title="Invoices"
        description="Internal invoice snapshots for Bankful card orders and payment attempts that need review."
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
                <th className="px-2 py-2 font-semibold">Bankful</th>
                <th className="px-2 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {result.data.map((invoice) => (
                <tr key={`${invoice.source}:${invoice.attemptId}`} className="align-top">
                  <td className="px-2 py-3">
                    <p className="font-semibold">{invoice.orderNumber || invoice.orderId || invoice.attemptId}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{invoice.source === 'order' ? 'Order' : 'Attempt'}</p>
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
                    <p className="break-all text-[10px]">Record: {invoice.bankful?.recordId || '—'}</p>
                    <p className="mt-1 break-all text-[10px] text-muted-foreground">Order: {invoice.bankful?.orderId || '—'}</p>
                  </td>
                  <td className="px-2 py-3 text-[10px] text-muted-foreground">
                    {formatDateTime(invoice.updatedAt)}
                  </td>
                </tr>
              ))}
              {result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-sm text-muted-foreground">
                    No Bankful invoices found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <div className="space-y-3">
        {result.data.map((invoice) => (
          <DetailBlock key={`detail:${invoice.source}:${invoice.attemptId}`} invoice={invoice} />
        ))}
      </div>
    </div>
  );
}
