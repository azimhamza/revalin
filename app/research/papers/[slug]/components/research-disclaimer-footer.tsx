import { ShieldCheck } from "lucide-react";

export function ResearchDisclaimerFooter() {
  return (
    <section className="mt-12 px-sides text-[#0B2E2F]">
      <aside className="mx-auto flex max-w-[72ch] flex-col gap-4 border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-5 md:flex-row md:gap-5 md:p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#0B2E2F]/12 bg-white/70">
          <ShieldCheck className="size-4" strokeWidth={1.5} />
        </div>
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
            Research use only
          </p>
          <p className="text-sm leading-relaxed text-[#0B2E2F]/72">
            All content published in the Revalin research library is intended
            exclusively for licensed researchers working in laboratory
            settings. Nothing on this page is medical advice. Products
            referenced are not intended for human or animal consumption,
            diagnosis, treatment, or cure of any disease.
          </p>
        </div>
      </aside>
    </section>
  );
}
