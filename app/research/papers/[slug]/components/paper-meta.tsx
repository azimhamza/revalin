import { ArrowUpRight } from "lucide-react";

import type { ResearchPaperAuthor } from "@/lib/db/schema";

type PaperMetaProps = {
  authors: ResearchPaperAuthor[];
  publicationDate?: Date | null;
  readingTimeMinutes: number;
  doi?: string | null;
  externalUrl?: string | null;
};

export function PaperMeta({
  authors,
  publicationDate,
  readingTimeMinutes,
  doi,
  externalUrl,
}: PaperMetaProps) {
  const dateString = publicationDate
    ? new Date(publicationDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mt-10 border-y border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-sides py-5 text-[#0B2E2F]">
      <div className="mx-auto max-w-[1600px]">
        <dl className="grid gap-5 md:grid-cols-[1.5fr_1fr_1fr_1.2fr] md:gap-6">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Authors
            </dt>
            <dd className="mt-2 text-sm leading-snug text-[#0B2E2F]">
              {authors.length === 0
                ? "Revalin Research Team"
                : authors.map((a) => a.name).join(", ")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Published
            </dt>
            <dd className="mt-2 text-sm text-[#0B2E2F]">
              {dateString ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Reading time
            </dt>
            <dd className="mt-2 text-sm text-[#0B2E2F]">
              {readingTimeMinutes} min
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              Reference
            </dt>
            <dd className="mt-2 flex flex-wrap items-center gap-4 text-[#0B2E2F]">
              {doi ? (
                <a
                  href={`https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F]"
                >
                  DOI
                  <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                </a>
              ) : null}
              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F]"
                >
                  Source
                  <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                </a>
              ) : null}
              {!doi && !externalUrl ? (
                <span className="text-sm text-[#0B2E2F]/55">—</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
