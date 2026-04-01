import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { affiliates, user } from '@/lib/db/schema';

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find an approved affiliate record matching this user's email
    const rows = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.email, session.user.email.toLowerCase()))
      .limit(1);

    const affiliate = rows[0];
    if (!affiliate || affiliate.status !== 'approved') {
      return NextResponse.json({ linked: false });
    }

    // Link the affiliate record to this user
    if (!affiliate.userId) {
      await db
        .update(affiliates)
        .set({ userId: session.user.id, updatedAt: new Date() })
        .where(eq(affiliates.id, affiliate.id));
    }

    // Set user role to affiliate if currently customer
    const currentRole = (session.user as any).role;
    if (currentRole === 'customer') {
      await db
        .update(user)
        .set({ role: 'affiliate', updatedAt: new Date() })
        .where(eq(user.id, session.user.id));
    }

    return NextResponse.json({ linked: true, affiliateCode: affiliate.code });
  } catch (error) {
    console.error('[LINK-AFFILIATE]', error);
    return NextResponse.json({ error: 'Failed to link affiliate.' }, { status: 500 });
  }
}
