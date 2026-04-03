"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { getAdminPageMeta } from "./admin-navigation";

export function AdminHeader() {
  const pathname = usePathname();
  const page = getAdminPageMeta(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-2.5 px-2.5 py-2.5 sm:px-3.5 lg:px-4">
        <div className="flex items-start gap-2">
          <SidebarTrigger />

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Revalin Admin</span>
              <ChevronRight className="size-3" />
              <span className="truncate">{page.title}</span>
            </div>
            <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-foreground md:text-[1.15rem]">
              {page.title}
            </h1>
            <p className="max-w-4xl text-[11px] leading-4 text-muted-foreground">
              {page.description}
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden h-7 rounded-none px-2.5 text-[10px] uppercase tracking-[0.14em] sm:inline-flex"
          >
            <Link href="/account">Account</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
