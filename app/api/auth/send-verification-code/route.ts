import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { sendTransactionalEmail } from '@/lib/email/loops';
import {
  AUTH_CODE_RESEND_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_CODE_PURPOSE,
  buildAuthCodeIdentifier,
  createAuthCode,
  deleteAuthCode,
  hasRecentAuthCodeRequest,
} from '@/lib/auth-code-verification';

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

  const identifier = buildAuthCodeIdentifier(EMAIL_VERIFICATION_CODE_PURPOSE, email);

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION?.trim();
  if (!transactionalId) {
    console.error('LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION is not configured.');
    return NextResponse.json(
      { error: 'Email verification is not configured.' },
      { status: 500 }
    );
  }

  if (await hasRecentAuthCodeRequest(identifier)) {
    return NextResponse.json(
      {
        error: `Please wait ${AUTH_CODE_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
      },
      { status: 429 }
    );
  }

  const code = await createAuthCode(identifier);

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
    await deleteAuthCode(identifier, code);
    console.error('Failed to send verification email:', err);
    return NextResponse.json(
      { error: 'Failed to send verification email.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
