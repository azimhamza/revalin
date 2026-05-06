import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { SidebarLinks } from '@/components/layout/sidebar/product-sidebar-links';
import { cn } from '@/lib/utils';

type PapersSidebarProps = {
  peptides: Array<{ slug: string; name: string }>;
  topics: string[];
  activePeptide?: string;
  activeTopic?: string;
  className?: string;
};

function buildHref(params: {
  peptide?: string;
  topic?: string;
}) {
  const search = new URLSearchParams();
  if (params.peptide) search.set('peptide', params.peptide);
  if (params.topic) search.set('topic', params.topic);
  const qs = search.toString();
  return qs ? `/research/papers?${qs}` : '/research/papers';
}

export function PapersSidebar({
  peptides,
  topics,
  activePeptide,
  activeTopic,
  className,
}: PapersSidebarProps) {
  const hasFilters = Boolean(activePeptide || activeTopic);

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen min-h-max flex-col justify-between pl-sides pt-top-spacing pb-sides',
        className,
      )}
    >
      <div className="flex flex-col gap-6 text-[#0B2E2F]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
            Research library
          </p>
          <p className="mt-3 italic tracking-tighter text-base">
            Peer-reviewed papers, curated.
          </p>
          <div className="mt-4 space-y-1 text-sm leading-tight text-[#0B2E2F]/72">
            <p>Every paper cross-linked to the compound it studies.</p>
            <p>Filter by compound or topic.</p>
            <p>No marketing copy — the literature, as published.</p>
          </div>
        </div>

        <Link
          href="/research"
          className="inline-flex items-center gap-2 self-start text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F]"
        >
          <ArrowUpRight
            className="size-3.5 rotate-180"
            strokeWidth={1.5}
          />
          Back to research hub
        </Link>

        {peptides.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Compound
            </p>
            <div className="flex flex-wrap gap-1.5">
              <SidebarChip
                href={buildHref({ topic: activeTopic })}
                active={!activePeptide}
              >
                All
              </SidebarChip>
              {peptides.map((peptide) => (
                <SidebarChip
                  key={peptide.slug}
                  href={buildHref({
                    peptide: peptide.slug,
                    topic: activeTopic,
                  })}
                  active={activePeptide === peptide.slug}
                >
                  {peptide.name}
                </SidebarChip>
              ))}
            </div>
          </div>
        ) : null}

        {topics.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Topic
            </p>
            <div className="flex flex-wrap gap-1.5">
              <SidebarChip
                href={buildHref({ peptide: activePeptide })}
                active={!activeTopic}
              >
                All
              </SidebarChip>
              {topics.map((topic) => (
                <SidebarChip
                  key={topic}
                  href={buildHref({
                    peptide: activePeptide,
                    topic,
                  })}
                  active={activeTopic === topic}
                >
                  {topic}
                </SidebarChip>
              ))}
            </div>
          </div>
        ) : null}

        {hasFilters ? (
          <Link
            href="/research/papers"
            className="inline-flex items-center gap-1 self-start text-[10px] font-medium uppercase tracking-[0.22em] text-[#0B2E2F]/55 underline transition-colors hover:text-[#0B2E2F]"
          >
            Clear filters
          </Link>
        ) : null}
      </div>

      <div className="pt-sides">
        <SidebarLinks className="flex-col-reverse" size="sm" />
      </div>
    </aside>
  );
}

function SidebarChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors',
        active
          ? 'border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]'
          : 'border-[#0B2E2F]/12 bg-[#F4F1EA]/78 text-[#0B2E2F]/72 hover:border-[#0B2E2F]/40 hover:text-[#0B2E2F]',
      )}
    >
      {children}
    </Link>
  );
}
