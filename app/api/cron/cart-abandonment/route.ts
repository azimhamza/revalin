import { NextResponse } from 'next/server';
import { processAbandonedCheckouts } from '@/lib/email/cart-abandonment';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await processAbandonedCheckouts({ abandonAfterMinutes: 60 });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[CRON-CART-ABANDONMENT] Error:', error);
    return NextResponse.json({ error: 'Cron job failed.' }, { status: 500 });
  }
}
