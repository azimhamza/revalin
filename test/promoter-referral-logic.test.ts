import assert from "node:assert/strict";
import test from "node:test";

import {
  getFirstName,
  resolveAutoActivationCommissionRate,
  resolveGrowRedirect,
  shouldShowBoostDialog,
  type GrowRedirectInput,
} from "../lib/checkout/promoter-referral-logic.ts";

// ─── getFirstName ────────────────────────────────────────────────────────

test("getFirstName extracts first word from full name", () => {
  assert.equal(getFirstName("John Smith"), "John");
});

test("getFirstName returns single name as-is", () => {
  assert.equal(getFirstName("Jane"), "Jane");
});

test("getFirstName trims whitespace", () => {
  assert.equal(getFirstName("  Alice  Johnson  "), "Alice");
});

test("getFirstName returns null for empty string", () => {
  assert.equal(getFirstName(""), null);
});

test("getFirstName returns null for whitespace-only string", () => {
  assert.equal(getFirstName("   "), null);
});

test("getFirstName returns null for null", () => {
  assert.equal(getFirstName(null), null);
});

test("getFirstName returns null for undefined", () => {
  assert.equal(getFirstName(undefined), null);
});

// ─── resolveGrowRedirect ─────────────────────────────────────────────────

function baseInput(overrides: Partial<GrowRedirectInput> = {}): GrowRedirectInput {
  return {
    isLoggedIn: false,
    affiliateStatus: null,
    promoterCode: "promo-abc",
    promoterFirstName: "John",
    ...overrides,
  };
}

test("not logged in → signup with callbackUrl and promoter name", () => {
  const result = resolveGrowRedirect(baseInput());
  assert.equal(result.destination, "signup");
  assert.equal(
    "callbackUrl" in result ? result.callbackUrl : "",
    "/affiliate/signup?promoter=promo-abc",
  );
  assert.equal("promoterName" in result ? result.promoterName : "", "John");
});

test("not logged in, code with special chars → callbackUrl is encoded", () => {
  const result = resolveGrowRedirect(
    baseInput({ promoterCode: "promo code&test" }),
  );
  assert.equal(result.destination, "signup");
  assert.equal(
    "callbackUrl" in result ? result.callbackUrl : "",
    "/affiliate/signup?promoter=promo%20code%26test",
  );
});

test("logged in, no affiliate record → affiliate signup", () => {
  const result = resolveGrowRedirect(
    baseInput({ isLoggedIn: true, affiliateStatus: null }),
  );
  assert.equal(result.destination, "affiliate_signup");
  assert.equal(
    "promoterCode" in result ? result.promoterCode : "",
    "promo-abc",
  );
});

test("logged in, affiliate pending → account boost", () => {
  const result = resolveGrowRedirect(
    baseInput({ isLoggedIn: true, affiliateStatus: "pending" }),
  );
  assert.equal(result.destination, "account_boost");
  assert.equal(
    "promoterCode" in result ? result.promoterCode : "",
    "promo-abc",
  );
});

test("logged in, affiliate suspended → account boost", () => {
  const result = resolveGrowRedirect(
    baseInput({ isLoggedIn: true, affiliateStatus: "suspended" }),
  );
  assert.equal(result.destination, "account_boost");
});

test("logged in, affiliate approved → affiliate dashboard", () => {
  const result = resolveGrowRedirect(
    baseInput({ isLoggedIn: true, affiliateStatus: "approved" }),
  );
  assert.equal(result.destination, "affiliate_dashboard");
});

test("logged in, affiliate rejected → account without boost", () => {
  const result = resolveGrowRedirect(
    baseInput({ isLoggedIn: true, affiliateStatus: "rejected" }),
  );
  assert.equal(result.destination, "account_no_boost");
});

// ─── shouldShowBoostDialog ───────────────────────────────────────────────

test("show dialog when pending affiliate linked successfully", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "pending",
      linkResult: { linked: true },
    }),
    true,
  );
});

test("show dialog when suspended affiliate linked successfully", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "suspended",
      linkResult: { linked: true },
    }),
    true,
  );
});

test("hide dialog when no promoter boost code", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: null,
      affiliateStatus: "pending",
      linkResult: { linked: true },
    }),
    false,
  );
});

test("hide dialog when affiliate is approved", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "approved",
      linkResult: { linked: true },
    }),
    false,
  );
});

test("hide dialog when affiliate is rejected", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "rejected",
      linkResult: { linked: true },
    }),
    false,
  );
});

test("hide dialog when no affiliate record", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: null,
      linkResult: { linked: true },
    }),
    false,
  );
});

test("hide dialog when link failed (already attributed)", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "pending",
      linkResult: { linked: false },
    }),
    false,
  );
});

test("hide dialog when link result is null", () => {
  assert.equal(
    shouldShowBoostDialog({
      promoterBoostCode: "promo-abc",
      affiliateStatus: "pending",
      linkResult: null,
    }),
    false,
  );
});

// ─── resolveAutoActivationCommissionRate ──────────────────────────────────

test("uses invite commission rate when set", () => {
  assert.equal(
    resolveAutoActivationCommissionRate({
      inviteCommissionRate: "0.03",
      promoterDefaultCommissionRate: "0.05",
    }),
    "0.03",
  );
});

test("falls back to promoter default commission rate", () => {
  assert.equal(
    resolveAutoActivationCommissionRate({
      inviteCommissionRate: null,
      promoterDefaultCommissionRate: "0.05",
    }),
    "0.05",
  );
});

test("falls back to global default (0.025) when both are null", () => {
  assert.equal(
    resolveAutoActivationCommissionRate({
      inviteCommissionRate: null,
      promoterDefaultCommissionRate: null,
    }),
    "0.025",
  );
});

test("skips empty string invite rate and uses promoter default", () => {
  assert.equal(
    resolveAutoActivationCommissionRate({
      inviteCommissionRate: "",
      promoterDefaultCommissionRate: "0.04",
    }),
    "0.04",
  );
});

test("skips empty string promoter default and uses global default", () => {
  assert.equal(
    resolveAutoActivationCommissionRate({
      inviteCommissionRate: "",
      promoterDefaultCommissionRate: "",
    }),
    "0.025",
  );
});
