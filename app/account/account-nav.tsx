"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LayoutGrid, Package, Shield, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_ADMIN_ROUTE,
  ACCOUNT_AFFILIATE_ROUTE,
  ACCOUNT_NAV_ROUTES,
} from "@/lib/app-routes";

const NAV_ITEMS = ACCOUNT_NAV_ROUTES.map((item) => ({
  ...item,
  icon:
    item.href === "/account"
      ? LayoutGrid
      : item.href === "/account/orders"
        ? Package
        : item.href === "/account/security"
          ? KeyRound
        : UserRound,
}));

function isActivePath(pathname: string, href: string) {
  if (href === "/account") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountNav({
  showAffiliate = false,
  showAdmin = false,
}: {
  showAffiliate?: boolean;
  showAdmin?: boolean;
}) {
  const pathname = usePathname();
  const navItems = [...NAV_ITEMS];

  if (showAffiliate) {
    navItems.push({
      ...ACCOUNT_AFFILIATE_ROUTE,
      icon: Users,
    });
  }

  if (showAdmin) {
    navItems.push({
      ...ACCOUNT_ADMIN_ROUTE,
      icon: Shield,
    });
  }

  return (
    <nav
      className={cn(
        "grid gap-3",
        navItems.length >= 5
          ? "lg:grid-cols-5"
          : navItems.length === 4
            ? "lg:grid-cols-4"
            : "lg:grid-cols-3",
      )}
      aria-label="Account sections"
    >
      {navItems.map((item, index) => {
        const isActive = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-l-2 px-4 py-4 transition-all duration-200",
              isActive
                ? "border-l-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA] shadow-[0_18px_60px_rgba(11,46,47,0.14)]"
                : "border-l-transparent border-[#0B2E2F]/10 bg-[#FCFAF6] text-foreground hover:bg-white",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em]",
                isActive ? "text-[#F4F1EA]/45" : "text-[#0B2E2F]/34",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tracking-tight">
                {item.label}
              </p>
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center border transition-colors",
                  isActive
                    ? "border-white/12 bg-white/8 text-[#F4F1EA]"
                    : "border-[#0B2E2F]/10 bg-[#0B2E2F]/5 text-[#0B2E2F] group-hover:bg-[#0B2E2F]/8",
                )}
              >
                <Icon className="size-5" />
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
