'use client';

import { ArrowRight } from 'lucide-react';
import { Article } from '../providers/peptide-provider';

export function ArticleCard({ article }: { article: Article }) {
  return (
    <div className="relative w-full aspect-[3/4] md:aspect-square bg-muted group overflow-hidden">
      {/* Default state */}
      <div className="flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-within:opacity-0 group-focus-within:-translate-y-full">
        <span className="text-xs text-muted-foreground mb-2">{article.topic}</span>
        <p className="text-sm uppercase font-semibold text-balance line-clamp-2">
          {article.title}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {article.date} · {article.readTime}
        </p>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-3 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-popover md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-within:translate-y-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto max-md:pointer-events-auto">
          <span className="text-xs text-muted-foreground">{article.topic}</span>

          <p className="text-lg font-semibold leading-tight line-clamp-2">
            {article.title}
          </p>

          <p className="text-xs text-muted-foreground">
            {article.date} · {article.readTime}
          </p>

          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {article.excerpt}
          </p>

          {article.studies.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">References</p>
              {article.studies.slice(0, 2).map((study) => (
                <a
                  key={study.pmid}
                  href={study.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-foreground hover:underline"
                >
                  <span className="line-clamp-1">{study.title}</span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
