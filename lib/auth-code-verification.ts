import crypto from 'crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { verification } from '@/lib/db/schema';

export const AUTH_CODE_LENGTH = 6;
export const AUTH_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const AUTH_CODE_EXPIRES_IN_MS = 10 * 60 * 1000;

export const EMAIL_VERIFICATION_CODE_PURPOSE = 'email-verification';
export const PASSWORD_RESET_CODE_PURPOSE = 'password-reset';

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildAuthCodeIdentifier(purpose: string, email: string) {
  return `${purpose}:${normalizeAuthEmail(email)}`;
}

export async function hasRecentAuthCodeRequest(identifier: string) {
  const recent = await db
    .select({ createdAt: verification.createdAt })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        gt(
          verification.createdAt,
          new Date(Date.now() - AUTH_CODE_RESEND_COOLDOWN_SECONDS * 1000),
        ),
      ),
    )
    .limit(1);

  return recent.length > 0;
}

export async function createAuthCode(identifier: string) {
  await db.delete(verification).where(eq(verification.identifier, identifier));

  const code = crypto
    .randomInt(10 ** (AUTH_CODE_LENGTH - 1), 10 ** AUTH_CODE_LENGTH)
    .toString();

  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: code,
    expiresAt: new Date(Date.now() + AUTH_CODE_EXPIRES_IN_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return code;
}

export async function findValidAuthCode(identifier: string, code: string) {
  const matches = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        eq(verification.value, code),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return matches[0] ?? null;
}

export async function deleteAuthCode(identifier: string, code?: string) {
  if (code) {
    await db
      .delete(verification)
      .where(and(eq(verification.identifier, identifier), eq(verification.value, code)));
    return;
  }

  await db.delete(verification).where(eq(verification.identifier, identifier));
}

export async function createPasswordResetToken(userId: string) {
  const token = crypto.randomBytes(24).toString('hex');

  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + AUTH_CODE_EXPIRES_IN_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return token;
}
