'use client';

import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

export interface Peptide {
  id: string;
  slug: string;
  name: string;
  sequence: string;
  description: string;
  tags: string[];
}

interface ResearchContextType {
  peptides: Peptide[];
  filteredPeptides: Peptide[];
  selectedTag: string;
  setSelectedTag: (tag: string) => void;
  uniqueTags: string[];
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

export function ResearchProvider({ peptides, children }: { peptides: Peptide[]; children: ReactNode }) {
  const [selectedTag, setSelectedTag] = useState('all');

  const uniqueTags = useMemo(
    () => Array.from(new Set(peptides.flatMap((p) => p.tags))).sort(),
    [peptides]
  );

  const filteredPeptides = useMemo(() => {
    if (selectedTag === 'all') return peptides;
    return peptides.filter((peptide) => peptide.tags.includes(selectedTag));
  }, [peptides, selectedTag]);

  return (
    <ResearchContext.Provider
      value={{
        peptides,
        filteredPeptides,
        selectedTag,
        setSelectedTag,
        uniqueTags,
      }}
    >
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearch() {
  const context = useContext(ResearchContext);
  if (context === undefined) {
    throw new Error('useResearch must be used within a ResearchProvider');
  }
  return context;
}
