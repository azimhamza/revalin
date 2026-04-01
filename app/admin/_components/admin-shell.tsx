import type { ReactNode } from "react";

import { ADMIN_NAV_ROUTES } from "@/lib/app-routes";
import { cn } from "@/lib/utils";

export const adminNavItems = ADMIN_NAV_ROUTES;

export const adminFieldClass =
  "h-10 rounded-none border-[#0B2E2F]/14 bg-[#FCFAF6] shadow-none placeholder:text-[#0B2E2F]/35 focus-visible:border-[#0B2E2F]/38 focus-visible:ring-0";

export const adminPrimaryButtonClass =
  "rounded-none border border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA] hover:bg-[#173d3e]";

export const adminSecondaryButtonClass =
  "rounded-none border border-[#0B2E2F]/16 bg-[#FCFAF6] text-[#0B2E2F] hover:bg-[#EFE7D9]";

type AdminPanelProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "inverse";
};

export function AdminPanel({
  children,
  className,
  tone = "default",
}: AdminPanelProps) {
  return (
    <section
      className={cn(
        "border p-5 md:p-6",
        tone === "default" && "border-[#0B2E2F]/12 bg-[#F7F4EC]",
        tone === "muted" && "border-[#0B2E2F]/10 bg-[#EFE7D8]",
        tone === "inverse" && "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]",
        className,
      )}
    >
      {children}
    </section>
  );
}

type AdminSectionHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
};

export function AdminSectionHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: AdminSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0B2E2F]/48">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[#0B2E2F]">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-5 text-[#0B2E2F]/62">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type AdminStatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "muted" | "inverse";
  className?: string;
};

export function AdminStatCard({
  label,
  value,
  detail,
  tone = "default",
  className,
}: AdminStatCardProps) {
  return (
    <AdminPanel
      tone={tone}
      className={cn(
        "flex min-h-[152px] flex-col justify-between gap-6",
        className,
      )}
    >
      <div className="space-y-3">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.2em]",
            tone === "inverse" ? "text-[#F4F1EA]/58" : "text-[#0B2E2F]/46",
          )}
        >
          {label}
        </p>
        <p className="text-3xl font-semibold tracking-[-0.06em]">{value}</p>
      </div>
      {detail ? (
        <p
          className={cn(
            "text-sm leading-5",
            tone === "inverse" ? "text-[#F4F1EA]/74" : "text-[#0B2E2F]/58",
          )}
        >
          {detail}
        </p>
      ) : null}
    </AdminPanel>
  );
}
