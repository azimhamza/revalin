'use client';

import { usePeptide } from '../providers/peptide-provider';
import { ArticleGrid } from './article-grid';
import { ArticleCard } from './article-card';

export function ArticleListContent() {
  const { filteredArticles } = usePeptide();

  return (
    <>
      <div className="grid grid-cols-3 items-center mb-1 w-full pr-sides max-md:hidden">
        <div />
        <span className="place-self-center text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
          {filteredArticles.length} papers
        </span>
        <div />
      </div>

      {filteredArticles.length > 0 ? (
        <ArticleGrid>
          {filteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </ArticleGrid>
      ) : (
        <div className="mr-sides flex flex-1 items-center justify-center border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-10 text-[#0B2E2F]">
          <p className="text-sm uppercase tracking-[0.18em] text-[#0B2E2F]/55">
            No papers found
          </p>
        </div>
      )}
    </>
  );
}
