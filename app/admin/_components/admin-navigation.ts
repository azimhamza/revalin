import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  BookOpen,
  Handshake,
  LayoutDashboard,
  Megaphone,
  Users,
  Wallet,
} from "lucide-react";

export type AdminNavigationItem = {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItem[] = [
  {
    title: "Overview",
    href: "/admin",
    description: "Monitor traffic, queues, and operational health.",
    icon: LayoutDashboard,
  },
  {
    title: "Users",
    href: "/admin/users",
    description: "Manage access, roles, and account state.",
    icon: Users,
  },
  {
    title: "Restock Alerts",
    href: "/admin/product-notifications",
    description: "Review variant demand, charts, and send restock emails.",
    icon: BellRing,
  },
  {
    title: "Research",
    href: "/admin/research",
    description: "Author, publish, and manage peptides and research papers.",
    icon: BookOpen,
  },
  {
    title: "Growth Partners",
    href: "/admin/affiliates",
    description: "Approve partners, sync codes, and repair affiliate records.",
    icon: Handshake,
  },
  {
    title: "Promoters",
    href: "/admin/promoters",
    description: "Approve promoters, manage invites, and activate partner mappings.",
    icon: Megaphone,
  },
  {
    title: "Payouts",
    href: "/admin/payouts",
    description: "Approve settlement requests and mark outbound payouts.",
    icon: Wallet,
  },
];

export function isActiveAdminPath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function getAdminPageMeta(pathname: string) {
  return (
    ADMIN_NAVIGATION_ITEMS.find((item) => isActiveAdminPath(pathname, item.href)) ?? {
      title: "Admin",
      href: "/admin",
      description: "Manage operational workflows across the admin console.",
      icon: LayoutDashboard,
    }
  );
}
