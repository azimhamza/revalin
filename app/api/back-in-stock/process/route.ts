import { z } from 'zod';
import { NextResponse } from 'next/server';
import { processBackInStockSubscriptions } from '@/lib/back-in-stock/service';

const processSchema = z.object({
  handles: z.array(z.string().trim().min(1)).optional(),
  limit: z.number().int().positive().max(250).optional(),
});

function isAuthorized(request: Request) {
  const expectedToken = process.env.BACKORDER_PROCESS_TOKEN?.trim();

  if (!expectedToken) {
    return false;
  }

  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${expectedToken}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const rawBody = await request.text();
    const body = rawBody ? processSchema.parse(JSON.parse(rawBody)) : {};
    const result = await processBackInStockSubscriptions(body);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid back-in-stock process payload.' }, { status: 400 });
    }

    console.error('Unable to process back-in-stock notifications:', error);
    return NextResponse.json({ error: 'Unable to process back-in-stock notifications.' }, { status: 500 });
  }
}
