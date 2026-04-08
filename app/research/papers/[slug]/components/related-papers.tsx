import type { ResearchPaperSummary } from "@/lib/research/queries";

import { EditorialPaperCard } from "../../../components/editorial-paper-card";
import { ResearchSectionHeader } from "../../../components/research-section-header";

type RelatedPapersProps = {
  papers: ResearchPaperSummary[];
};

export function RelatedPapers({ papers }: RelatedPapersProps) {
  if (papers.length === 0) return null;
  return (
    <section className="mt-16 border-t border-[#0B2E2F]/12 bg-[#EBE7DC] px-sides py-10 md:py-14">
      <div className="mx-auto max-w-[1600px]">
        <ResearchSectionHeader
          eyebrow="Further reading"
          title="Related papers"
          ctaHref="/research/papers"
          ctaLabel="View all"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
          {papers.map((paper) => (
            <EditorialPaperCard
              key={paper.id}
              paper={paper}
              variant="compact"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
