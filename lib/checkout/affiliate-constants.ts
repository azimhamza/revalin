export const AFFILIATE_COOKIE_NAME = "revalin_ref";
export const AFFILIATE_DISCOUNT_COOKIE_NAME = "revalin_ref_discount";
export const AFFILIATE_COOKIE_MAX_AGE_DAYS = 30;
export const AFFILIATE_VISITOR_COOKIE_NAME = "revalin_affiliate_visitor";
export const AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS = 365;
export const PROMOTER_REFERRAL_COOKIE_NAME = "revalin_promoter_ref";
export const PROMOTER_REFERRAL_SOURCE_COOKIE_NAME = "revalin_promoter_ref_source";
export const PROMOTER_REFERRAL_COOKIE_MAX_AGE_DAYS = 30;

export const RESERVED_SLUGS = new Set([
  // Existing app routes
  "about",
  "api",
  "checkout",
  "coa",
  "contact",
  "faq",
  "privacy-policy",
  "product",
  "research",
  "shipping",
  "shop",
  "terms-of-service",
  "affiliate",
  "promoter",
  // Next.js internals + common
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Safety / auth
  "admin",
  "order",
  "login",
  "signup",
  "verify-email",
  "register",
  "logout",
  "forgot-password",
  "account",
  "error",
]);
