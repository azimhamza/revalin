import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

type ResearchSectionHeaderProps = {
  eyebrow: string;
  title: string;
  dek?: string;
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
};

export function ResearchSectionHeader({
  eyebrow,
  title,
  dek,
  ctaHref,
  ctaLabel,
  className = '',
}: ResearchSectionHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-6 md:flex-row md:items-end md:justify-between ${className}`}
    >
      <div className="max-w-2xl space-y-3 text-[#0B2E2F]">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
          {eyebrow}
        </p>
        <h2 className="text-balance text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]">
          {title}
        </h2>
        {dek ? (
          <p className="max-w-xl text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
            {dek}
          </p>
        ) : null}
      </div>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 self-start text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F] md:self-end"
        >
          {ctaLabel}
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
        </Link>
      ) : null}
    </div>
  );
}
