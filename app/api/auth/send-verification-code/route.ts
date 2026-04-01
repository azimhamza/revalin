import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { verification } from '@/lib/db/schema';
import { sendTransactionalEmail } from '@/lib/email/loops';

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email?.trim();
  const name = session.user.name?.trim();
  if (!email) {
    return NextResponse.json({ error: 'Missing user email.' }, { status: 400 });
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION?.trim();
  if (!transactionalId) {
    console.error('LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION is not configured.');
    return NextResponse.json(
      { error: 'Email verification is not configured.' },
      { status: 500 }
    );
  }

  // Rate limit: check if a code was created in the last 60 seconds
  const recent = await db
    .select({ createdAt: verification.createdAt })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, email),
        gt(verification.createdAt, new Date(Date.now() - 60_000))
      )
    )
    .limit(1);

  if (recent.length > 0) {
    return NextResponse.json(
      { error: 'Please wait 60 seconds before requesting a new code.' },
      { status: 429 }
    );
  }

  // Delete any existing verification records for this email
  await db.delete(verification).where(eq(verification.identifier, email));

  // Generate 6-digit code
  const code = crypto.randomInt(100_000, 1_000_000).toString();

  // Insert new verification record
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: email,
    value: code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    await sendTransactionalEmail({
      email,
      transactionalId,
      dataVariables: {
        name: name || 'there',
        code,
      },
    });
  } catch (err) {
    await db
      .delete(verification)
      .where(and(eq(verification.identifier, email), eq(verification.value, code)));
    console.error('Failed to send verification email:', err);
    return NextResponse.json(
      { error: 'Failed to send verification email.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
