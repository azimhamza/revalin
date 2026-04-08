'use client';

import { useResearch } from '../providers/research-provider';
import { ResearchGrid } from './research-grid';
import { ResearchCard } from './research-card';

export function ResearchListContent() {
  const { filteredPeptides } = useResearch();

  return (
    <>
      <div className="grid grid-cols-3 items-center mb-1 w-full pr-sides max-md:hidden pt-6">
        <div />
        <span className="place-self-center text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
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
        <div className="mr-sides flex flex-1 items-center justify-center border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-10 text-[#0B2E2F]">
          <p className="text-sm uppercase tracking-[0.18em] text-[#0B2E2F]/55">
            No peptides found
          </p>
        </div>
      )}
    </>
  );
}
