import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type PaperPeptideChipsProps = {
  peptides: Array<{ slug: string; name: string }>;
};

export function PaperPeptideChips({ peptides }: PaperPeptideChipsProps) {
  if (peptides.length === 0) return null;
  return (
    <section className="mt-14 px-sides text-[#0B2E2F]">
      <div className="mx-auto max-w-[72ch]">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
          Related peptides
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {peptides.map((peptide) => (
            <Link
              key={peptide.slug}
              href={`/research/${peptide.slug}`}
              className="inline-flex items-center gap-2 border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:border-[#0B2E2F]/40 hover:text-[#0B2E2F]"
            >
              {peptide.name}
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
