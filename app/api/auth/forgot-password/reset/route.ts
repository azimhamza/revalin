import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const newPassword =
    typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!token) {
    return NextResponse.json({ error: 'Reset session expired. Request a new code.' }, { status: 400 });
  }

  if (!newPassword) {
    return NextResponse.json({ error: 'Enter a new password.' }, { status: 400 });
  }

  try {
    await auth.api.resetPassword({
      body: {
        token,
        newPassword,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: getAuthErrorMessage(error, 'Unable to reset password.') },
      { status: getAuthErrorStatus(error, 400) },
    );
  }
}

function getAuthErrorStatus(error: unknown, fallback: number) {
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number') {
      return status;
    }
  }

  return fallback;
}

function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}
