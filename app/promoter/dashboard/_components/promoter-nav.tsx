"use client";

import { usePathname } from "next/navigation";

import { IntentLink } from "@/components/navigation/intent-link";
import { cn } from "@/lib/utils";

import { promoterNavItems } from "./promoter-shell";

function isActivePath(pathname: string, href: string) {
  if (href === "/promoter/dashboard") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function PromoterNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-px border border-[#0B2E2F]/10 bg-[#0B2E2F]/10">
      {promoterNavItems.map((item, index) => {
        const active = isActivePath(pathname, item.href);

        return (
          <IntentLink
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between gap-2.5 border-l-2 bg-[#FCFAF6] px-3.5 py-2.5 transition-colors",
              active
                ? "border-l-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                : "border-l-transparent hover:bg-white",
            )}
          >
            <p className="text-[12px] font-semibold tracking-tight">
              {item.label}
            </p>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.14em]",
                active ? "text-[#F4F1EA]/45" : "text-[#0B2E2F]/34",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
          </IntentLink>
        );
      })}
    </nav>
  );
}
