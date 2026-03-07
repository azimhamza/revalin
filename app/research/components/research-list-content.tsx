'use client';

import { useResearch } from '../providers/research-provider';
import { ResearchGrid } from './research-grid';
import { ResearchCard } from './research-card';
import { Card } from '@/components/ui/card';

export function ResearchListContent() {
  const { filteredPeptides } = useResearch();

  return (
    <>
      <div className="grid grid-cols-3 items-center mb-1 w-full pr-sides max-md:hidden">
        <div />
        <span className="place-self-center text-sm text-foreground/50">
          {filteredPeptides.length} results
        </span>
        <div />
      </div>

      {filteredPeptides.length > 0 ? (
        <ResearchGrid>
          {filteredPeptides.map((peptide) => (
            <ResearchCard key={peptide.id} peptide={peptide} />
          ))}
        </ResearchGrid>
      ) : (
        <Card className="flex mr-sides flex-1 items-center justify-center">
          <p className="text text-muted-foreground font-medium">
            No peptides found
          </p>
        </Card>
      )}
    </>
  );
}
