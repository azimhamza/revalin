import type { ReactNode } from "react";

import { AFFILIATE_NAV_ROUTES } from "@/lib/app-routes";
import { cn } from "@/lib/utils";

export const affiliateNavItems = AFFILIATE_NAV_ROUTES;

export const affiliatePanelClass =
  "border border-[#0B2E2F]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(244,241,234,0.92)_100%)] shadow-[0_20px_64px_rgba(11,46,47,0.06)]";

export const affiliateInsetClass =
  "border border-[#0B2E2F]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(247,244,236,0.94)_100%)] backdrop-blur-sm";

export const affiliateMutedPanelClass =
  "border border-[#0B2E2F]/10 bg-[linear-gradient(180deg,rgba(244,241,234,0.88)_0%,rgba(255,255,255,0.8)_100%)]";

export const affiliateDarkPanelClass =
  "border border-[#0B2E2F]/12 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),linear-gradient(155deg,#0B2E2F_0%,#123B3D_100%)] text-[#F4F1EA] shadow-[0_22px_72px_rgba(11,46,47,0.14)]";

export const affiliateFieldClass =
  "h-11 rounded-none border-[#0B2E2F]/12 bg-[#FCFAF6] shadow-none placeholder:text-[#0B2E2F]/35 focus-visible:border-[#0B2E2F]/36 focus-visible:ring-0";

export const affiliatePrimaryButtonClass =
  "rounded-none border border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA] hover:bg-[#173d3e]";

export const affiliateSecondaryButtonClass =
  "rounded-none border border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F] hover:bg-white";

export const affiliateIconFrameClass =
  "flex items-center justify-center border border-[#0B2E2F]/10 bg-[#0B2E2F]/5";

export const affiliateIconTileClass = `${affiliateIconFrameClass} size-10`;

export const affiliateChipClass =
  "inline-flex border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-1 text-xs font-medium text-[#0B2E2F]/72";

export const affiliateStatusChipClass =
  "inline-flex border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";

export function getAffiliateStatusClasses(status?: string | null) {
  if (status === "approved") {
    return "border-emerald-500/20 bg-emerald-500/8 text-emerald-800";
  }

  if (status === "pending") {
    return "border-amber-500/24 bg-amber-500/10 text-amber-800";
  }

  if (status === "suspended") {
    return "border-slate-400/24 bg-slate-500/10 text-slate-700";
  }

  if (status === "rejected") {
    return "border-red-500/20 bg-red-500/8 text-red-700";
  }

  return "border-[#0B2E2F]/12 bg-[#0B2E2F]/6 text-[#0B2E2F]/70";
}

export function getPayoutStatusClasses(status?: string | null) {
  if (status === "paid") {
    return "border-emerald-500/20 bg-emerald-500/8 text-emerald-800";
  }

  if (status === "approved") {
    return "border-sky-500/20 bg-sky-500/8 text-sky-800";
  }

  if (status === "pending") {
    return "border-amber-500/24 bg-amber-500/10 text-amber-800";
  }

  if (status === "rejected") {
    return "border-red-500/20 bg-red-500/8 text-red-700";
  }

  return "border-[#0B2E2F]/12 bg-[#0B2E2F]/6 text-[#0B2E2F]/70";
}

type AffiliatePanelProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "inverse";
};

export function AffiliatePanel({
  children,
  className,
  tone = "default",
}: AffiliatePanelProps) {
  return (
    <section
      className={cn(
        "border p-5 md:p-6",
        tone === "default" && affiliatePanelClass,
        tone === "muted" && affiliateMutedPanelClass,
        tone === "inverse" && affiliateDarkPanelClass,
        className,
      )}
    >
      {children}
    </section>
  );
}

type AffiliateSectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function AffiliateSectionHeader({
  title,
  description,
  action,
  className,
}: AffiliateSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
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
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type AffiliateStatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "muted" | "inverse";
  className?: string;
};

export function AffiliateStatCard({
  label,
  value,
  detail,
  tone = "default",
  className,
}: AffiliateStatCardProps) {
  return (
    <AffiliatePanel
      tone={tone}
      className={cn(
        "flex min-h-[148px] flex-col justify-between gap-6",
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
    </AffiliatePanel>
  );
}
