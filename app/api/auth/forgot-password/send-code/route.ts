import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { sendTransactionalEmail } from '@/lib/email/loops';
import {
  AUTH_CODE_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createAuthCode,
  deleteAuthCode,
  hasRecentAuthCodeRequest,
  normalizeAuthEmail,
} from '@/lib/auth-code-verification';

const GENERIC_RESPONSE = {
  success: true,
  message: 'If an account exists for that email, we sent a 6-digit code.',
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeAuthEmail(typeof body?.email === 'string' ? body.email : '');

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PASSWORD_RESET?.trim() ||
    process.env.LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION?.trim();

  if (!transactionalId) {
    console.error(
      'Password reset email is not configured. Set LOOPS_TRANSACTIONAL_PASSWORD_RESET or LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION.',
    );
    return NextResponse.json(
      { error: 'Password reset email is not configured.' },
      { status: 500 },
    );
  }

  const identifier = buildAuthCodeIdentifier(PASSWORD_RESET_CODE_PURPOSE, email);

  if (await hasRecentAuthCodeRequest(identifier)) {
    return NextResponse.json(
      {
        error: `Please wait ${AUTH_CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      },
      { status: 429 },
    );
  }

  const matchedUsers = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  const matchedUser = matchedUsers[0];

  if (!matchedUser) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const code = await createAuthCode(identifier);

  try {
    await sendTransactionalEmail({
      email: matchedUser.email,
      transactionalId,
      dataVariables: {
        name: matchedUser.name?.trim() || 'there',
        code,
      },
    });
  } catch (error) {
    await deleteAuthCode(identifier, code);
    console.error('Failed to send password reset code:', error);
    return NextResponse.json(
      { error: 'Failed to send password reset code.' },
      { status: 500 },
    );
  }

  return NextResponse.json(GENERIC_RESPONSE);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
