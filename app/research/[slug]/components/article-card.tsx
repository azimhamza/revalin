'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Article } from '../providers/peptide-provider';

export function ArticleCard({ article }: { article: Article }) {
  const hasHero = Boolean(article.heroImageUrl);
  const href = `/research/papers/${article.slug}`;
  const crossPeptides = article.peptides.filter((p) => p.slug !== undefined);

  return (
    <Link
      href={href}
      prefetch
      className="relative w-full aspect-[3/4] md:aspect-square bg-[#EBE7DC] group overflow-hidden block focus-visible:outline-none"
      aria-label={`Read paper: ${article.title}`}
    >
      {hasHero ? (
        <Image
          src={article.heroImageUrl as string}
          alt={article.heroImageAlt ?? article.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="absolute inset-0 object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : null}
      {hasHero ? (
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B2E2F]/80 via-[#0B2E2F]/25 to-transparent" />
      ) : null}

      {/* Default state */}
      <div
        className={`relative z-10 flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-visible:opacity-0 group-focus-visible:-translate-y-full ${
          hasHero ? 'text-[#F4F1EA] drop-shadow-md' : 'text-[#0B2E2F]'
        }`}
      >
        <p
          className={`text-[10px] uppercase tracking-[0.22em] mb-2 ${
            hasHero ? 'text-[#F4F1EA]/80' : 'text-[#0B2E2F]/55'
          }`}
        >
          {article.topic}
        </p>
        <p className="text-base leading-tight tracking-[-0.02em] text-balance line-clamp-2 md:text-lg">
          {article.title}
        </p>
        <p
          className={`mt-2 text-[10px] uppercase tracking-[0.18em] ${
            hasHero ? 'text-[#F4F1EA]/80' : 'text-[#0B2E2F]/55'
          }`}
        >
          {article.date}
          {article.readTime ? ` · ${article.readTime}` : ''}
        </p>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none z-10">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-3 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-[#F4F1EA]/95 text-[#0B2E2F] md:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-visible:translate-y-0 group-hover:pointer-events-auto group-focus-visible:pointer-events-auto max-md:pointer-events-auto">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            {article.topic}
          </p>

          <p className="text-lg leading-tight tracking-[-0.02em] text-[#0B2E2F] line-clamp-2">
            {article.title}
          </p>

          <p className="text-[10px] uppercase tracking-[0.18em] text-[#0B2E2F]/55">
            {article.date}
            {article.readTime ? ` · ${article.readTime}` : ''}
          </p>

          <p className="text-sm leading-relaxed text-[#0B2E2F]/72 line-clamp-3">
            {article.excerpt}
          </p>

          {crossPeptides.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {crossPeptides.map((p) => (
                <span
                  key={p.slug}
                  className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#0B2E2F]/72"
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : null}

          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 group-hover:text-[#0B2E2F]">
            Read paper
            <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
