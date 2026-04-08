import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  PASSWORD_RESET_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createPasswordResetToken,
  deleteAuthCode,
  findValidAuthCode,
  normalizeAuthEmail,
} from '@/lib/auth-code-verification';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeAuthEmail(typeof body?.email === 'string' ? body.email : '');
  const code = String(body?.code ?? '').replace(/\D/g, '').slice(0, 6);

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (code.length !== 6) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }

  const identifier = buildAuthCodeIdentifier(PASSWORD_RESET_CODE_PURPOSE, email);
  const match = await findValidAuthCode(identifier, code);

  if (!match) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  const matchedUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  const matchedUser = matchedUsers[0];

  if (!matchedUser) {
    await deleteAuthCode(identifier);
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  const resetToken = await createPasswordResetToken(matchedUser.id);
  await deleteAuthCode(identifier);

  return NextResponse.json({
    success: true,
    resetToken,
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
