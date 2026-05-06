'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Peptide } from '../providers/research-provider';

export function ResearchCard({ peptide }: { peptide: Peptide }) {
  const hasHero = Boolean(peptide.heroImageUrl);
  return (
    <div className="relative w-full aspect-[3/4] md:aspect-square bg-[#EBE7DC] group overflow-hidden">
      {hasHero ? (
        <Image
          src={peptide.heroImageUrl as string}
          alt={peptide.heroImageAlt ?? peptide.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="absolute inset-0 object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : null}
      {hasHero ? (
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B2E2F]/80 via-[#0B2E2F]/25 to-transparent" />
      ) : null}

      {typeof peptide.paperCount === 'number' && peptide.paperCount > 0 ? (
        <span className="absolute top-3 right-3 z-10 border border-[#0B2E2F]/12 bg-[#F4F1EA]/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#0B2E2F] backdrop-blur">
          {peptide.paperCount} paper{peptide.paperCount === 1 ? '' : 's'}
        </span>
      ) : null}

      <Link
        href={`/research/${peptide.slug}`}
        className="block size-full focus-visible:outline-none"
        aria-label={`View research profile for ${peptide.name}`}
        prefetch
      >
        {/* Default state */}
        <div
          className={`flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-visible:opacity-0 group-focus-visible:-translate-y-full ${
            hasHero ? 'relative z-10 text-[#F4F1EA] drop-shadow-md' : 'text-[#0B2E2F]'
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] opacity-75">
            Compound profile
          </p>
          <p className="mt-1 text-base font-medium tracking-[-0.02em] md:text-lg">
            {peptide.name}
          </p>
          <p
            className={`mt-1 line-clamp-1 font-mono text-xs ${
              hasHero ? 'text-[#F4F1EA]/80' : 'text-[#0B2E2F]/55'
            }`}
          >
            {peptide.sequence}
          </p>
        </div>
      </Link>

      {/* Hover overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none z-10">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-4 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-[#F4F1EA]/95 text-[#0B2E2F] md:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-visible:translate-y-0 group-hover:pointer-events-auto group-focus-visible:pointer-events-auto max-md:pointer-events-auto">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
                Compound profile
              </p>
              <p className="mt-1 text-lg tracking-[-0.02em]">{peptide.name}</p>
            </div>
            <ArrowUpRight
              className="mt-1 size-4 shrink-0 text-[#0B2E2F]/55"
              strokeWidth={1.5}
            />
          </div>

          <p className="font-mono text-xs text-[#0B2E2F]/55 line-clamp-1">
            {peptide.sequence}
          </p>

          <p className="text-sm leading-relaxed text-[#0B2E2F]/72 line-clamp-3">
            {peptide.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {peptide.tags.map((tag) => (
              <span
                key={tag}
                className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#0B2E2F]/72"
              >
                {tag}
              </span>
            ))}
          </div>

          <Link
            href={`/research/${peptide.slug}`}
            prefetch
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F]"
          >
            View profile
            <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}
