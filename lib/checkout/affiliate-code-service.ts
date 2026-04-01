import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import { sendAffiliateApprovalEmail } from "@/lib/email/affiliate-emails";
import {
  createSwellAffiliateCoupon,
  createSwellCouponCode,
  findSwellCouponCodeByCode,
  listSwellCouponCodes,
  setSwellCouponActive,
  updateSwellAffiliateCoupon,
  updateSwellCouponCode,
} from "@/lib/checkout/swell-order-management";

type AffiliateRow = typeof affiliates.$inferSelect;

export type AffiliateCodeAssignment = {
  affiliateId: string;
  affiliateCode: string;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: AffiliateRow["status"];
  swellCouponId: string | null;
  referralLink: string;
  checkoutLink: string | null;
  emailSent: boolean;
};

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (!explicit) return "https://revalin.ca";
  return explicit.replace(/\/$/, "");
}

function buildLinks(affiliateCode: string, discountCode: string | null) {
  const siteUrl = getSiteUrl();

  return {
    referralLink: `${siteUrl}/${affiliateCode}`,
    checkoutLink: discountCode
      ? `${siteUrl}/checkout?discount=${encodeURIComponent(discountCode)}`
      : null,
  };
}

function normalizeDiscountCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new Error("A Swell discount code is required.");
  }

  return normalized;
}

function normalizeDiscountPercent(value: string) {
  const parsed = Number(value.trim());

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error("Discount percent must be a number between 0 and 100.");
  }

  const rounded = Number(parsed.toFixed(2));
  return {
    numeric: rounded,
    stored: `${rounded}`,
  };
}

function buildCouponName(row: Pick<AffiliateRow, "name" | "code">) {
  return `Growth Partner - ${row.name || row.code}`;
}

function buildCouponDescription(row: Pick<AffiliateRow, "email" | "code">) {
  return `Affiliate discount for ${row.email} (${row.code})`;
}

async function getAffiliateRow(affiliateId: string) {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error("Affiliate not found.");
  }

  return row;
}

export async function getAffiliateCodeAssignment(
  affiliateId: string,
): Promise<AffiliateCodeAssignment> {
  const row = await getAffiliateRow(affiliateId);
  const links = buildLinks(row.code, row.discountCode);

  return {
    affiliateId: row.id,
    affiliateCode: row.code,
    discountCode: row.discountCode,
    discountPercent: row.discountPercent,
    commissionRate: row.commissionRate,
    status: row.status,
    swellCouponId: row.swellCouponId,
    referralLink: links.referralLink,
    checkoutLink: links.checkoutLink,
    emailSent: false,
  };
}

export async function saveAffiliateCodeAssignment(args: {
  affiliateId: string;
  discountCode: string;
  discountPercent: string;
  commissionRate?: string;
  approve?: boolean;
  sendEmail?: boolean;
}): Promise<AffiliateCodeAssignment> {
  const row = await getAffiliateRow(args.affiliateId);
  const normalizedDiscountCode = normalizeDiscountCode(args.discountCode);
  const normalizedDiscountPercent = normalizeDiscountPercent(
    args.discountPercent,
  );
  const nextCommissionRate = args.commissionRate?.trim() || row.commissionRate;

  const existingLocalDiscountCode = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(
      and(
        eq(affiliates.discountCode, normalizedDiscountCode),
        ne(affiliates.id, row.id),
      ),
    )
    .limit(1);

  if (existingLocalDiscountCode.length > 0) {
    throw new Error(
      "That Swell discount code is already assigned to another affiliate.",
    );
  }

  const existingSwellCode = await findSwellCouponCodeByCode(
    normalizedDiscountCode,
  );
  if (
    existingSwellCode?.parent_id &&
    existingSwellCode.parent_id !== row.swellCouponId
  ) {
    throw new Error("That Swell discount code is already in use.");
  }

  let swellCouponId = row.swellCouponId;

  if (!swellCouponId) {
    const coupon = await createSwellAffiliateCoupon({
      code: normalizedDiscountCode,
      name: buildCouponName(row),
      description: buildCouponDescription(row),
      percentOff: normalizedDiscountPercent.numeric,
      active: true,
    });

    swellCouponId = coupon.id;
  } else {
    const currentCodeRows = await listSwellCouponCodes({
      parentId: swellCouponId,
      limit: 10,
    });
    const currentCode = currentCodeRows[0] || null;
    const currentCodeValue = currentCode?.code?.trim().toUpperCase() || "";

    if (currentCode && currentCodeValue !== normalizedDiscountCode) {
      await updateSwellCouponCode(currentCode.id, normalizedDiscountCode);
    } else if (!currentCode && !existingSwellCode) {
      await createSwellCouponCode(swellCouponId, normalizedDiscountCode);
    }

    await updateSwellAffiliateCoupon({
      couponId: swellCouponId,
      name: buildCouponName(row),
      description: buildCouponDescription(row),
      percentOff: normalizedDiscountPercent.numeric,
      active: true,
    });
  }

  const nextStatus: AffiliateRow["status"] = args.approve
    ? "approved"
    : row.status;

  await db
    .update(affiliates)
    .set({
      discountCode: normalizedDiscountCode,
      discountPercent: normalizedDiscountPercent.stored,
      commissionRate: nextCommissionRate,
      swellCouponId,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, row.id));

  let emailSent = false;
  if (args.sendEmail) {
    const emailResponse = await sendAffiliateApprovalEmail({
      affiliateName: row.name,
      affiliateEmail: row.email,
      affiliateCode: row.code,
      discountCode: normalizedDiscountCode,
      discountPercent: normalizedDiscountPercent.stored,
    });
    emailSent = Boolean(emailResponse);
  }

  const links = buildLinks(row.code, normalizedDiscountCode);

  return {
    affiliateId: row.id,
    affiliateCode: row.code,
    discountCode: normalizedDiscountCode,
    discountPercent: normalizedDiscountPercent.stored,
    commissionRate: nextCommissionRate,
    status: nextStatus,
    swellCouponId,
    referralLink: links.referralLink,
    checkoutLink: links.checkoutLink,
    emailSent,
  };
}

export async function setAffiliateCodeAssignmentActive(args: {
  affiliateId: string;
  active: boolean;
  status: AffiliateRow["status"];
}) {
  const row = await getAffiliateRow(args.affiliateId);

  if (row.swellCouponId) {
    await setSwellCouponActive(row.swellCouponId, args.active);
  }

  await db
    .update(affiliates)
    .set({
      status: args.status,
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, row.id));

  return getAffiliateCodeAssignment(row.id);
}
