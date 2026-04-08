import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const currentPassword =
    typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword =
    typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!newPassword) {
    return NextResponse.json({ error: 'Enter a new password.' }, { status: 400 });
  }

  const credentialAccounts = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.providerId, 'credential')),
    )
    .limit(1);

  const hasPassword = credentialAccounts.length > 0;

  if (hasPassword && !currentPassword) {
    return NextResponse.json(
      { error: 'Enter your current password.' },
      { status: 400 },
    );
  }

  try {
    if (hasPassword) {
      await auth.api.changePassword({
        headers: request.headers,
        body: {
          currentPassword,
          newPassword,
        },
      });
    } else {
      await auth.api.setPassword({
        headers: request.headers,
        body: {
          newPassword,
        },
      });
    }

    return NextResponse.json({
      success: true,
      hasPassword: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: getAuthErrorMessage(error, 'Unable to update password.') },
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
