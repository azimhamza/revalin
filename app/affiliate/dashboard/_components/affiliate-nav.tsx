"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { affiliateNavItems } from "./affiliate-shell";

function isActivePath(pathname: string, href: string) {
  if (href === "/affiliate/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function AffiliateNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-px border border-[#0B2E2F]/10 bg-[#0B2E2F]/10">
      {affiliateNavItems.map((item, index) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-l-2 bg-[#FCFAF6] px-4 py-4 transition-colors",
              active
                ? "border-l-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                : "border-l-transparent hover:bg-white",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em]",
                active ? "text-[#F4F1EA]/45" : "text-[#0B2E2F]/34",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-sm font-semibold tracking-tight">{item.label}</p>
          </Link>
        );
      })}
    </nav>
  );
}
