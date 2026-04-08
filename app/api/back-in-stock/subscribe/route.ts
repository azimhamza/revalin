import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getLiveProduct } from '@/lib/swell';
import { subscribeToBackInStock } from '@/lib/back-in-stock/service';
import { ProductNotificationError } from '@/lib/back-in-stock/utils';

const subscribeSchema = z.object({
  email: z.string().trim().email(),
  productHandle: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
});

export async function POST(request: Request) {
  try {
    const body = subscribeSchema.parse(await request.json());
    const product = await getLiveProduct(body.productHandle);

    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const result = await subscribeToBackInStock({
      email: body.email,
      product,
      variantId: body.variantId,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      message: result.created
        ? 'You are on the list. We will email you when this selection is back in stock.'
        : 'You are already on the list for this selection.',
    });
  } catch (error) {
    if (error instanceof ProductNotificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    console.error('Unable to subscribe to back-in-stock notifications:', error);
    return NextResponse.json(
      {
        error: 'Unable to save your request right now.',
      },
      { status: 500 }
    );
  }
}
