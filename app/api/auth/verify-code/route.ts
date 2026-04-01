import { NextResponse } from 'next/server';
import { eq, and, gt } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { verification, user } from '@/lib/db/schema';

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const code = String(body.code ?? '').trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'Invalid code format.' }, { status: 400 });
  }

  // Look up matching, non-expired verification record
  const match = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, session.user.email),
        eq(verification.value, code),
        gt(verification.expiresAt, new Date())
      )
    )
    .limit(1);

  if (match.length === 0) {
    return NextResponse.json(
      { error: 'Invalid or expired code.' },
      { status: 400 }
    );
  }

  // Mark user as verified
  await db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  // Clean up verification record
  await db.delete(verification).where(eq(verification.identifier, session.user.email));

  return NextResponse.json({ success: true });
}
