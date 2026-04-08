'use client';

import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  topic: string;
  date: string;
  readTime: string;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  peptides: Array<{ slug: string; name: string }>;
}

export interface PeptideData {
  name: string;
  fullName: string;
  slug: string;
  sequence: string;
  description: string;
  molecularWeight: string;
  cas: string;
  productSlug: string;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
}

interface PeptideContextType {
  peptide: PeptideData;
  articles: Article[];
  filteredArticles: Article[];
  selectedTopic: string;
  setSelectedTopic: (topic: string) => void;
  uniqueTopics: string[];
}

const PeptideContext = createContext<PeptideContextType | undefined>(undefined);

export function PeptideProvider({
  peptide,
  articles,
  children,
}: {
  peptide: PeptideData;
  articles: Article[];
  children: ReactNode;
}) {
  const [selectedTopic, setSelectedTopic] = useState('all');

  const uniqueTopics = useMemo(
    () => Array.from(new Set(articles.map((a) => a.topic))).sort(),
    [articles]
  );

  const filteredArticles = useMemo(() => {
    if (selectedTopic === 'all') return articles;
    return articles.filter((article) => article.topic === selectedTopic);
  }, [articles, selectedTopic]);

  return (
    <PeptideContext.Provider
      value={{
        peptide,
        articles,
        filteredArticles,
        selectedTopic,
        setSelectedTopic,
        uniqueTopics,
      }}
    >
      {children}
    </PeptideContext.Provider>
  );
}

export function usePeptide() {
  const context = useContext(PeptideContext);
  if (context === undefined) {
    throw new Error('usePeptide must be used within a PeptideProvider');
  }
  return context;
}
