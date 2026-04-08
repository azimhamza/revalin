import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import type { ResearchPaperSummary } from '@/lib/research/queries';

type EditorialPaperCardProps = {
  paper: ResearchPaperSummary;
  variant?: 'default' | 'compact';
  className?: string;
};

export function EditorialPaperCard({
  paper,
  variant = 'default',
  className = '',
}: EditorialPaperCardProps) {
  const isCompact = variant === 'compact';
  return (
    <Link
      href={`/research/papers/${paper.slug}`}
      prefetch
      className={`group flex flex-col border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 text-[#0B2E2F] transition-colors hover:bg-[#F4F1EA] ${className}`}
    >
      {paper.heroImageUrl ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#EBE7DC]">
          <Image
            src={paper.heroImageUrl}
            alt={paper.heroImageAlt ?? paper.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-[16/10] w-full bg-[#EBE7DC]" aria-hidden />
      )}

      <div
        className={`flex flex-1 flex-col ${isCompact ? 'p-4' : 'p-5'}`}
      >
        {paper.topics.length > 0 ? (
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            {paper.topics[0]}
          </p>
        ) : null}

        <h3
          className={`mt-3 line-clamp-2 text-balance tracking-[-0.03em] text-[#0B2E2F] ${
            isCompact
              ? 'text-base leading-tight'
              : 'text-lg leading-tight md:text-[1.35rem]'
          }`}
        >
          {paper.title}
        </h3>

        {!isCompact && paper.excerpt ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[#0B2E2F]/72">
            {paper.excerpt}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            {paper.readingTimeMinutes} min read
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors group-hover:text-[#0B2E2F]">
            Read paper
            <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
