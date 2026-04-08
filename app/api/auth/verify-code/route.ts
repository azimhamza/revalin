import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  EMAIL_VERIFICATION_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  deleteAuthCode,
  findValidAuthCode,
} from '@/lib/auth-code-verification';

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

  const identifier = buildAuthCodeIdentifier(
    EMAIL_VERIFICATION_CODE_PURPOSE,
    session.user.email,
  );
  const match = await findValidAuthCode(identifier, code);

  if (!match) {
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
  await deleteAuthCode(identifier);

  return NextResponse.json({ success: true });
}
