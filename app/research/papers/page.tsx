import type { Metadata } from "next";

import { PageLayout } from "@/components/layout/page-layout";
import {
  listPeptides,
  listPublishedPapers,
} from "@/lib/research/queries";

import { EditorialPaperCard } from "../components/editorial-paper-card";
import { PapersSidebar } from "./components/papers-sidebar";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Research Papers | Revalin",
  description:
    "Browse published research papers, protocols, and literature summaries from the Revalin research library.",
  alternates: {
    canonical: "/research/papers",
  },
};

type PapersPageProps = {
  searchParams: Promise<{
    peptide?: string;
    topic?: string;
  }>;
};

export default async function PapersIndexPage({ searchParams }: PapersPageProps) {
  const { peptide: peptideSlug, topic } = await searchParams;

  const [papers, peptides] = await Promise.all([
    listPublishedPapers({ limit: 60, peptideSlug, topic }),
    listPeptides(),
  ]);

  const topicSet = new Set<string>();
  for (const paper of papers) {
    for (const t of paper.topics) topicSet.add(t);
  }
  const topics = Array.from(topicSet).sort();

  const peptideOptions = peptides.map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <PageLayout>
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-sides">
        <PapersSidebar
          peptides={peptideOptions}
          topics={topics}
          activePeptide={peptideSlug}
          activeTopic={topic}
          className="col-span-3 max-md:hidden"
        />

        <div className="col-span-9 flex flex-col px-sides pb-16 pt-10 md:px-0 md:pr-sides md:pt-top-spacing">
          <header className="space-y-4 text-[#0B2E2F]">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
              Research library
            </p>
            <h1 className="max-w-3xl text-balance text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]">
              Papers &amp; protocols, as published.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
              Curated research chemical literature from the Revalin team. All content is
              intended for licensed researchers working in laboratory settings.
            </p>
          </header>

          {/* Mobile filters */}
          <MobileFilters
            peptides={peptideOptions}
            topics={topics}
            activePeptide={peptideSlug}
            activeTopic={topic}
          />

          {papers.length === 0 ? (
            <div className="mt-12 border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-8 text-[#0B2E2F]">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
                Empty shelf
              </p>
              <p className="mt-3 text-base leading-relaxed text-[#0B2E2F]/72">
                No published papers match these filters yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-5">
              {papers.map((paper) => (
                <EditorialPaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

function MobileFilters({
  peptides,
  topics,
  activePeptide,
  activeTopic,
}: {
  peptides: Array<{ slug: string; name: string }>;
  topics: string[];
  activePeptide?: string;
  activeTopic?: string;
}) {
  const hasFilters = Boolean(activePeptide || activeTopic);
  const buildHref = (next: { peptide?: string; topic?: string }) => {
    const search = new URLSearchParams();
    if (next.peptide) search.set("peptide", next.peptide);
    if (next.topic) search.set("topic", next.topic);
    const qs = search.toString();
    return qs ? `/research/papers?${qs}` : "/research/papers";
  };

  if (peptides.length === 0 && topics.length === 0) return null;

  return (
    <div className="mt-8 space-y-4 border-t border-[#0B2E2F]/12 pt-6 md:hidden">
      {peptides.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            Compound
          </p>
          <div className="flex flex-wrap gap-1.5">
            <MobileChip
              href={buildHref({ topic: activeTopic })}
              active={!activePeptide}
            >
              All
            </MobileChip>
            {peptides.map((p) => (
              <MobileChip
                key={p.slug}
                href={buildHref({ peptide: p.slug, topic: activeTopic })}
                active={activePeptide === p.slug}
              >
                {p.name}
              </MobileChip>
            ))}
          </div>
        </div>
      ) : null}

      {topics.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            Topic
          </p>
          <div className="flex flex-wrap gap-1.5">
            <MobileChip
              href={buildHref({ peptide: activePeptide })}
              active={!activeTopic}
            >
              All
            </MobileChip>
            {topics.map((t) => (
              <MobileChip
                key={t}
                href={buildHref({ peptide: activePeptide, topic: t })}
                active={activeTopic === t}
              >
                {t}
              </MobileChip>
            ))}
          </div>
        </div>
      ) : null}

      {hasFilters ? (
        <a
          href="/research/papers"
          className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.22em] text-[#0B2E2F]/55 underline"
        >
          Clear filters
        </a>
      ) : null}
    </div>
  );
}

function MobileChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
        active
          ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
          : "border-[#0B2E2F]/12 bg-[#F4F1EA]/78 text-[#0B2E2F]/72"
      }`}
    >
      {children}
    </a>
  );
}
