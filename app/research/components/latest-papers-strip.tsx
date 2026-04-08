import type { ResearchPaperSummary } from "@/lib/research/queries";

import { EditorialPaperCard } from "./editorial-paper-card";
import { ResearchSectionHeader } from "./research-section-header";

type LatestPapersStripProps = {
  papers: ResearchPaperSummary[];
};

export function LatestPapersStrip({ papers }: LatestPapersStripProps) {
  if (papers.length === 0) return null;
  return (
    <section className="px-sides pt-2 md:px-0 md:pt-0">
      <ResearchSectionHeader
        eyebrow="Latest papers"
        title="Newest research"
        ctaHref="/research/papers"
        ctaLabel="View all"
      />

      <div className="mt-8 flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:pb-0">
        {papers.slice(0, 6).map((paper) => (
          <div key={paper.id} className="w-[72vw] shrink-0 md:w-auto">
            <EditorialPaperCard paper={paper} variant="compact" />
          </div>
        ))}
      </div>
    </section>
  );
}
