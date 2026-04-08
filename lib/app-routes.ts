import type { NavItem } from "@/lib/types";

export const SITE_PRIMARY_ROUTES: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Research", href: "/research" },
  { label: "COA", href: "/coa" },
];

export const SITE_SECONDARY_ROUTES: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Shipping & Returns", href: "/shipping" },
  { label: "Contact", href: "/contact" },
  { label: "Growth Partner", href: "/affiliate/signup" },
];

export const SITE_LEGAL_ROUTES: NavItem[] = [
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

export const ACCOUNT_NAV_ROUTES: NavItem[] = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
];

export const ACCOUNT_AFFILIATE_ROUTE: NavItem = {
  href: "/affiliate/dashboard",
  label: "Growth Partner",
};

export const ACCOUNT_ADMIN_ROUTE: NavItem = {
  href: "/admin",
  label: "Admin",
};

export const ADMIN_NAV_ROUTES: NavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/affiliates", label: "Growth Partners" },
  { href: "/admin/payouts", label: "Payouts" },
];

export const AFFILIATE_NAV_ROUTES: NavItem[] = [
  { href: "/affiliate/dashboard", label: "Overview" },
  { href: "/affiliate/dashboard/analytics", label: "Analytics" },
  { href: "/affiliate/dashboard/payouts", label: "Payouts" },
];
