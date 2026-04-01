import crypto from 'node:crypto';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkoutDrafts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const draftSchema = z.object({
  email: z.string().trim().email(),
  cartSnapshot: z.object({
    currencyCode: z.string(),
    lines: z.array(
      z.object({
        productTitle: z.string(),
        variantTitle: z.string(),
        imageUrl: z.string(),
        quantity: z.number(),
        unitPrice: z.object({ amount: z.string(), currencyCode: z.string() }),
        lineTotal: z.object({ amount: z.string(), currencyCode: z.string() }),
      })
    ).min(1),
  }),
  shippingAddress: z.object({
    firstName: z.string(),
    lastName: z.string(),
    city: z.string(),
    province: z.string(),
    country: z.string(),
  }).optional(),
  totalsEstimate: z.object({
    subtotal: z.string(),
    total: z.string(),
    currencyCode: z.string(),
  }).optional(),
});

function hashEmail(email: string) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = draftSchema.parse(rawBody);
    const id = hashEmail(body.email);
    const now = new Date();

    await db
      .insert(checkoutDrafts)
      .values({
        id,
        email: body.email.toLowerCase().trim(),
        cartSnapshot: body.cartSnapshot,
        shippingAddress: body.shippingAddress || null,
        totalsEstimate: body.totalsEstimate || null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: checkoutDrafts.id,
        set: {
          cartSnapshot: body.cartSnapshot,
          shippingAddress: body.shippingAddress || null,
          totalsEstimate: body.totalsEstimate || null,
          updatedAt: now,
        },
        setWhere: eq(checkoutDrafts.paymentCompleted, null as unknown as Date),
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid draft data.' }, { status: 400 });
    }

    console.error('[SAVE-DRAFT] Error:', error);
    return NextResponse.json({ error: 'Unable to save draft.' }, { status: 500 });
  }
}
