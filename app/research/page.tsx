import type { Metadata } from 'next';

import { PageLayout } from '@/components/layout/page-layout';
import { listPeptides, listPublishedPapers } from '@/lib/research/queries';

import { ResearchProvider, type Peptide } from './providers/research-provider';
import { ResearchDesktopFilters } from './components/research-filters';
import { ResearchMobileFilters } from './components/research-mobile-filters';
import { ResearchListContent } from './components/research-list-content';
import { LatestPapersStrip } from './components/latest-papers-strip';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Research Library - Peptide Profiles & Documentation',
  description:
    'Comprehensive research peptide profiles with handling specifications, technical documentation, and peer-reviewed study references.',
  alternates: {
    canonical: '/research',
  },
};

export default async function ResearchPage() {
  const [peptideRows, latestPapers] = await Promise.all([
    listPeptides(),
    listPublishedPapers({ limit: 6 }),
  ]);

  const peptides: Peptide[] = peptideRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    sequence: row.sequence ?? '',
    description: row.description ?? '',
    tags: (row.tags as string[]) ?? [],
    heroImageUrl: row.heroImageUrl,
    heroImageAlt: row.heroImageAlt,
    paperCount: row.paperCount,
  }));

  return (
    <PageLayout>
      <ResearchProvider peptides={peptides}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <ResearchDesktopFilters className="col-span-3 max-md:hidden" />
          <ResearchMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            <header className="space-y-4 px-sides pt-10 text-[#0B2E2F] md:px-0 md:pt-0 md:pr-sides">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
                Research library
              </p>
              <h1 className="max-w-3xl text-balance text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]">
                Peptides, documentation, and published papers.
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
                A curated library of peptide profiles and peer-reviewed
                literature. For qualified researchers — no marketing claims,
                just the work.
              </p>
            </header>
            <div className="md:pr-sides md:pt-10">
              <LatestPapersStrip papers={latestPapers} />
            </div>
            <div className="mt-10 border-t border-[#0B2E2F]/12 md:mt-12">
              <ResearchListContent />
            </div>
          </div>
        </div>
      </ResearchProvider>
    </PageLayout>
  );
}
