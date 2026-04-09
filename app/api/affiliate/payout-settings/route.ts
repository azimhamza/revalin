import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { db } from '@/lib/db';
import { affiliates } from '@/lib/db/schema';
import { encrypt } from '@/lib/db/encryption';
import { getAffiliateByUserIdentity } from '@/lib/checkout/affiliate-service';

const walletSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      'Enter a valid USDC Polygon wallet address (0x...).',
    ),
});

export const dynamic = 'force-dynamic';

export const PATCH = createApiRoute({
  route: '/api/affiliate/payout-settings',
  access: 'affiliate-or-admin',
  bodySchema: walletSchema,
  cacheControl: 'no-store',
  handler: async ({ session, body }) => {
    const affiliate = await getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!affiliate) {
      throw apiError.notFound('No Growth Partner record found.');
    }

    const encrypted = encrypt(body.walletAddress);

    await db
      .update(affiliates)
      .set({
        encryptedWalletAddress: encrypted.ciphertext,
        walletIv: encrypted.iv,
        walletTag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(affiliates.id, affiliate.id));

    revalidatePath('/affiliate/dashboard', 'layout');
    revalidatePath('/affiliate/dashboard');
    revalidatePath('/affiliate/dashboard/analytics');
    revalidatePath('/affiliate/dashboard/payouts');
    revalidatePath('/account');
    revalidatePath('/admin/affiliates');
    revalidatePath('/admin/payouts');

    return {
      data: {
        saved: true,
      },
    };
  },
});
