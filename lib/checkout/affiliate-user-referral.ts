import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { AFFILIATE_COOKIE_NAME } from "@/lib/checkout/affiliate-constants";
import { getApprovedAffiliateByCode } from "@/lib/checkout/affiliate-service";

type StampUserReferralArgs = {
  userId: string;
  userEmail: string;
};

type StampUserReferralResult =
  | { stamped: true; code: string }
  | { stamped: false; reason: "no-cookie" | "invalid-code" | "self-referral" };

/**
 * Reads the revalin_ref cookie from the current request and, if it points at
 * an approved affiliate, stores the code on the user row so attribution
 * survives cleared cookies / cross-device scenarios.
 *
 * Semantics are last-touch: every call with a valid cookie overwrites the
 * previous stamp. That matches the existing cookie write behavior in
 * AffiliateRedirect where each /<slug> visit unconditionally refreshes
 * revalin_ref.
 *
 * Safe to call from Promise.allSettled — all errors are caught and mapped
 * to a stamped:false result so we never block the rest of the post-auth
 * reconcile pipeline.
 */
export async function stampUserReferralFromCookie(
  args: StampUserReferralArgs,
): Promise<StampUserReferralResult> {
  let cookieValue: string | null = null;
  try {
    const store = await cookies();
    cookieValue = store.get(AFFILIATE_COOKIE_NAME)?.value?.trim() ?? null;
  } catch {
    // Outside a request context (e.g. background job) — nothing to stamp.
    return { stamped: false, reason: "no-cookie" };
  }

  if (!cookieValue) {
    return { stamped: false, reason: "no-cookie" };
  }

  const normalizedCode = cookieValue.toLowerCase();
  const affiliate = await getApprovedAffiliateByCode(normalizedCode);
  if (!affiliate) {
    return { stamped: false, reason: "invalid-code" };
  }

  // Prevent self-attribution: an affiliate should never be marked as
  // referred by themselves. Match on either the stored userId (once the
  // affiliate has been linked) or the email (pre-link window).
  const affiliateEmail = affiliate.email?.toLowerCase() ?? "";
  const userEmail = args.userEmail.toLowerCase();
  const isSelfReferralByEmail =
    affiliateEmail.length > 0 && affiliateEmail === userEmail;

  if (isSelfReferralByEmail) {
    return { stamped: false, reason: "self-referral" };
  }

  await db
    .update(user)
    .set({
      referredByAffiliateCode: affiliate.code,
      referredByAffiliateAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, args.userId));

  return { stamped: true, code: affiliate.code };
}

/**
 * Reads the affiliate code previously stamped onto the user row. Used as a
 * fallback in the checkout finalize flow when the revalin_ref cookie is
 * missing but the shopper is authenticated.
 */
export async function getStoredUserReferralCode(
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      code: user.referredByAffiliateCode,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const code = rows[0]?.code?.trim();
  return code ? code : null;
}
