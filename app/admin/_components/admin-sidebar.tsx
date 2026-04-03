"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";

import { LogoSvg } from "@/components/layout/header/logo-svg";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

import {
  ADMIN_NAVIGATION_ITEMS,
  isActiveAdminPath,
} from "./admin-navigation";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <Link
          href="/admin"
          aria-label="Revalin admin"
          className="block border border-sidebar-border bg-sidebar-accent/80 px-2 py-2 group-data-[collapsible=icon]:hidden"
        >
          <LogoSvg className="h-auto w-full max-w-[7.25rem] text-sidebar-foreground" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActiveAdminPath(pathname, item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      size="sm"
                      tooltip={item.title}
                    >
                      <Link href={item.href} aria-label={item.title}>
                        <Icon />
                        <span className="flex-1 truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="space-y-1.5">
        <div className="flex items-center justify-between rounded-none border border-sidebar-border bg-sidebar-accent/70 px-1.5 py-1.5 group-data-[collapsible=icon]:hidden">
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-[0.14em] text-sidebar-foreground/48">
              Access level
            </p>
            <p className="text-[10px] font-semibold text-sidebar-foreground">
              Admin only
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-sidebar-primary/35 bg-sidebar-primary/12 px-1.5 py-0 text-[9px] text-sidebar-foreground"
          >
            Secure
          </Badge>
        </div>

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm" tooltip="Back to account">
              <Link href="/account" aria-label="Back to account">
                <ArrowLeft className="size-4" />
                <span>Back to account</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
