'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, RefreshCw, RotateCcw, X } from 'lucide-react';
import {
  AdminFilterTabs,
  AdminPanel,
  AdminSectionHeader,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from '@/app/admin/_components/admin-shell';
import { cn } from '@/lib/utils';

type InteracReview = {
  id: string;
  orderId: string | null;
  status: string;
  reason: string;
  expectedAmount: string | null;
  receivedAmount: string | null;
  messageCode: string | null;
  senderName: string | null;
  senderEmail: string | null;
  bankReference: string | null;
  screenshotUrls: unknown;
  adminNotes: string | null;
  createdAt: Date | string;
};

type Props = {
  initialReviews: InteracReview[];
  initialTotal: number;
  initialStatus: string;
};

const TABS = [
  { key: 'open', label: 'Needs review' },
  { key: 'resolved', label: 'Processed' },
  { key: 'ignored', label: 'Ignored' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'all', label: 'All' },
];

function formatAge(value: Date | string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function reasonLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function screenshotUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function InteracReviewManagement({
  initialReviews,
  initialTotal,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [total, setTotal] = useState(initialTotal);
  const [activeTab, setActiveTab] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    setReviews(initialReviews);
    setTotal(initialTotal);
    setActiveTab(initialStatus);
  }, [initialReviews, initialStatus, initialTotal]);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const switchTab = useCallback((tab: string) => {
    setActiveTab(tab);
    startTransition(() => {
      router.push(`/admin/interac?status=${tab}`);
      router.refresh();
    });
  }, [router]);

  const runAction = useCallback(async (reviewId: string, action: 'approve' | 'ignore' | 'refund' | 'reopen') => {
    setActionId(reviewId);
    try {
      const response = await fetch(`/api/admin/interac/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error('Unable to update Interac review.');
      }
      refresh();
    } finally {
      setActionId(null);
    }
  }, [refresh]);

  const options = TABS.map((tab) => ({
    ...tab,
    count: tab.key === activeTab ? total : 0,
  }));

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Operations"
        title="Interac Reviews"
        description="Review e-Transfer exceptions, screenshots, sender mismatches, and late payments. Exact authenticated message-code matches auto-confirm without appearing here."
        action={
          <button type="button" onClick={refresh} className={adminSecondaryButtonClass}>
            <RefreshCw className={cn('size-3', isPending && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      <AdminFilterTabs options={options} value={activeTab} onChange={switchTab} />

      <AdminPanel className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/70 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Sender</th>
                <th className="px-3 py-2">Evidence</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    No Interac reviews in this queue.
                  </td>
                </tr>
              ) : null}
              {reviews.map((review) => {
                const urls = screenshotUrls(review.screenshotUrls);
                const busy = actionId === review.id;
                return (
                  <tr key={review.id} className="align-top">
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-none border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                        {reasonLabel(review.reason)}
                      </span>
                      <p className="mt-1 text-[10px] text-muted-foreground">{review.status}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px]">
                      {review.orderId || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <p>Expected: {review.expectedAmount ? `$${review.expectedAmount} CAD` : '-'}</p>
                      <p className="text-muted-foreground">Received: {review.receivedAmount ? `$${review.receivedAmount} CAD` : '-'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono">{review.messageCode || '-'}</p>
                      {review.bankReference ? <p className="text-muted-foreground">Bank: {review.bankReference}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <p>{review.senderName || '-'}</p>
                      {review.senderEmail ? <p className="break-all text-muted-foreground">{review.senderEmail}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      {urls.length ? (
                        <div className="flex flex-col gap-1">
                          {urls.map((url, index) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#0B2E2F] underline underline-offset-2">
                              Screenshot {index + 1}
                              <ExternalLink className="size-3" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatAge(review.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        {review.status === 'open' ? (
                          <>
                            <button type="button" disabled={busy} onClick={() => void runAction(review.id, 'approve')} className={adminPrimaryButtonClass}>
                              <CheckCircle2 className="size-3" />
                              Approve
                            </button>
                            <button type="button" disabled={busy} onClick={() => void runAction(review.id, 'ignore')} className={adminSecondaryButtonClass}>
                              <X className="size-3" />
                              Ignore
                            </button>
                          </>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => void runAction(review.id, 'reopen')} className={adminSecondaryButtonClass}>
                            <RotateCcw className="size-3" />
                            Reopen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}
