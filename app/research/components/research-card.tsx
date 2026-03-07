'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Peptide } from '../providers/research-provider';

export function ResearchCard({ peptide }: { peptide: Peptide }) {
  return (
    <div className="relative w-full aspect-[3/4] md:aspect-square bg-muted group overflow-hidden">
      <Link
        href={`/research/${peptide.slug}`}
        className="block size-full focus-visible:outline-none"
        aria-label={`View research profile for ${peptide.name}`}
        prefetch
      >
        {/* Default state */}
        <div className="flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-visible:opacity-0 group-focus-visible:-translate-y-full">
          <p className="text-sm uppercase font-semibold text-balance">
            {peptide.name}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1 line-clamp-1">
            {peptide.sequence}
          </p>
        </div>
      </Link>

      {/* Hover overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-4 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-popover md:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-visible:translate-y-0 group-hover:pointer-events-auto group-focus-visible:pointer-events-auto max-md:pointer-events-auto">
          <div className="flex justify-between items-start gap-2">
            <p className="text-lg font-semibold">{peptide.name}</p>
            <ArrowRight className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />
          </div>

          <p className="text-xs text-muted-foreground font-mono line-clamp-1">
            {peptide.sequence}
          </p>

          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {peptide.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {peptide.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>

          <Link
            href={`/research/${peptide.slug}`}
            className="text-sm font-medium hover:underline"
            prefetch
          >
            View Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
