import type { ReactNode } from "react";

import { ADMIN_NAV_ROUTES } from "@/lib/app-routes";
import { cn } from "@/lib/utils";

export const adminNavItems = ADMIN_NAV_ROUTES;

export const adminFieldClass =
  "h-7 rounded-none border-border bg-background text-xs shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0";

export const adminPrimaryButtonClass =
  "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-none border border-transparent bg-primary px-2.5 text-[10px] uppercase tracking-[0.14em] leading-none text-primary-foreground shadow-sm hover:bg-primary/92";

export const adminSecondaryButtonClass =
  "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-none border border-border bg-background px-2.5 text-[10px] uppercase tracking-[0.14em] leading-none text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground";

type AdminPanelProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "inverse";
};

type AdminFilterOption<T extends string> = {
  key: T;
  label: string;
  count: number;
};

export function AdminPanel({
  children,
  className,
  tone = "default",
}: AdminPanelProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-none border p-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.06)] md:p-3",
        tone === "default" && "border-border/70 bg-card",
        tone === "muted" && "border-border/70 bg-muted/40",
        tone === "inverse" &&
          "border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_18px_48px_rgba(15,23,42,0.16)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

type AdminFilterTabsProps<T extends string> = {
  options: AdminFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function AdminFilterTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: AdminFilterTabsProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((option) => {
        const active = value === option.key;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-none border px-2.5 py-1 text-left text-[11px] shadow-sm transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="whitespace-nowrap font-semibold leading-none">
              {option.label}
            </span>
            <span
              className={cn(
                "text-xs leading-none tabular-nums",
                active
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground/80",
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
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
        "flex flex-col gap-2 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-current opacity-60">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-0.5">
          <h2 className="text-[1.15rem] font-semibold tracking-[-0.04em] text-current md:text-[1.3rem]">
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-[11px] leading-4 text-current opacity-70">
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
  size?: "default" | "compact";
  className?: string;
};

export function AdminStatCard({
  label,
  value,
  detail,
  tone = "default",
  size = "default",
  className,
}: AdminStatCardProps) {
  return (
    <AdminPanel
      tone={tone}
      className={cn(
        "flex flex-col justify-between",
        size === "default" && "min-h-[92px] gap-3",
        size === "compact" && "min-h-[64px] gap-1.5 p-2.5 md:p-2.5",
        className,
      )}
    >
      <div className={cn(size === "compact" ? "space-y-1" : "space-y-1.5")}>
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.2em]",
            size === "compact" ? "text-[8px]" : "text-[9px]",
            tone === "inverse"
              ? "text-sidebar-foreground/60"
              : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "font-semibold tracking-[-0.06em]",
            size === "compact" ? "text-base" : "text-[1.35rem]",
          )}
        >
          {value}
        </p>
      </div>
      {detail ? (
        <p
          className={cn(
            size === "compact" ? "text-[10px] leading-4" : "text-[11px] leading-4",
            tone === "inverse"
              ? "text-sidebar-foreground/78"
              : "text-muted-foreground",
          )}
        >
          {detail}
        </p>
      ) : null}
    </AdminPanel>
  );
}
