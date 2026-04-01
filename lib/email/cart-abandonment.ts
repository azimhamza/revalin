import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { checkoutDrafts } from '@/lib/db/schema';
import { eq, isNull, lt, and } from 'drizzle-orm';
import { hasLoopsConfig, sendLoopsEvent } from '@/lib/email/loops';

function hashEmail(email: string) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

export async function markCheckoutDraftCompleted(email: string) {
  const id = hashEmail(email);

  await db
    .update(checkoutDrafts)
    .set({
      paymentCompleted: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(checkoutDrafts.id, id));
}

export async function processAbandonedCheckouts(args: {
  abandonAfterMinutes?: number;
} = {}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping cart abandonment processing: Loops not configured.');
    return { processed: 0, sent: 0, failed: 0 };
  }

  const abandonAfterMs = (args.abandonAfterMinutes || 60) * 60 * 1000;
  const cutoffTime = new Date(Date.now() - abandonAfterMs);

  // Find drafts that:
  // 1. Have no payment_completed timestamp (payment not made)
  // 2. Have no abandonment_event_sent timestamp (event not already sent)
  // 3. Were last updated before the cutoff time (idle for >1hr)
  const abandonedDrafts = await db
    .select()
    .from(checkoutDrafts)
    .where(
      and(
        isNull(checkoutDrafts.paymentCompleted),
        isNull(checkoutDrafts.abandonmentEventSent),
        lt(checkoutDrafts.updatedAt, cutoffTime)
      )
    )
    .limit(50);

  let sent = 0;
  let failed = 0;

  for (const draft of abandonedDrafts) {
    try {
      const cartSnapshot = draft.cartSnapshot as {
        currencyCode: string;
        lines: Array<{
          productTitle: string;
          variantTitle: string;
          imageUrl: string;
          quantity: number;
          lineTotal: { amount: string; currencyCode: string };
        }>;
      };

      const firstItem = cartSnapshot.lines[0];
      const checkoutUrl = `${getSiteUrl()}/checkout`;

      await sendLoopsEvent({
        email: draft.email,
        eventName: 'cart_abandoned',
        eventProperties: {
          checkoutUrl,
          itemCount: cartSnapshot.lines.length,
          firstItemTitle: firstItem?.productTitle || '',
          firstItemImage: firstItem?.imageUrl || '',
          firstItemPrice: firstItem?.lineTotal.amount || '0',
          currencyCode: cartSnapshot.currencyCode,
        },
      });

      await db
        .update(checkoutDrafts)
        .set({
          abandonmentEventSent: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(checkoutDrafts.id, draft.id));

      sent++;
    } catch (error) {
      console.error(`[CART-ABANDONMENT] Failed for ${draft.email}:`, error);
      failed++;
    }
  }

  return {
    processed: abandonedDrafts.length,
    sent,
    failed,
  };
}
