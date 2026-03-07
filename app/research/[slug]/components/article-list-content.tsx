'use client';

import { usePeptide } from '../providers/peptide-provider';
import { ArticleGrid } from './article-grid';
import { ArticleCard } from './article-card';
import { Card } from '@/components/ui/card';

export function ArticleListContent() {
  const { filteredArticles } = usePeptide();

  return (
    <>
      <div className="grid grid-cols-3 items-center mb-1 w-full pr-sides max-md:hidden">
        <div />
        <span className="place-self-center text-sm text-foreground/50">
          {filteredArticles.length} results
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
        <Card className="flex mr-sides flex-1 items-center justify-center">
          <p className="text text-muted-foreground font-medium">
            No articles found
          </p>
        </Card>
      )}
    </>
  );
}
