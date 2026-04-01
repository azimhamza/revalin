import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getLiveProduct } from '@/lib/swell';
import { getInventoryState } from '@/lib/inventory';
import { subscribeToBackInStock } from '@/lib/back-in-stock/service';

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

    const variant = body.variantId ? product.variants.find(candidate => candidate.id === body.variantId) || null : null;
    const inventory = getInventoryState(product, variant);

    if (!inventory.isBackorder) {
      return NextResponse.json(
        {
          error: 'This product is already ready to order.',
        },
        { status: 409 }
      );
    }

    const result = await subscribeToBackInStock({
      email: body.email,
      productId: product.id,
      productHandle: product.handle,
      productTitle: product.title,
      variantId: variant?.id,
      variantTitle: variant?.title,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      message: result.created
        ? 'You are on the list. We will email you when this batch is ready again.'
        : 'You are already on the list for this product.',
    });
  } catch (error) {
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
