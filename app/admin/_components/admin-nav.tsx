"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { adminNavItems } from "./admin-shell";

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-px border border-[#0B2E2F]/12 bg-[#0B2E2F]/12">
      {adminNavItems.map((item, index) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-l-2 bg-[#F7F4EC] px-4 py-4 transition-colors",
              active
                ? "border-l-[#0B2E2F] bg-[#EFE7D8]"
                : "border-l-transparent hover:bg-[#F1EADB]",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/38">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-sm font-semibold text-[#0B2E2F]">{item.label}</p>
          </Link>
        );
      })}
    </nav>
  );
}
