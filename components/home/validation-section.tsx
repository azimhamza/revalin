import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, ClipboardCheck, Truck } from 'lucide-react';

const VALIDATION_PANELS = [
  {
    icon: ClipboardCheck,
    eyebrow: 'Testing',
    headline: 'Every batch tested by Janoshik Analytical.',
    detail:
      'Verification keys published with every Certificate of Analysis — no request form, no gatekeeping.',
    href: '/coa',
    cta: 'Review COAs',
  },
  {
    icon: BadgeCheck,
    eyebrow: 'Purity',
    headline: '>99% average purity across active peptides.',
    detail:
      'Documented on the COA, not in a headline. Research-grade material for in-vitro and pre-clinical work.',
    href: '/about',
    cta: 'Why Revalin',
  },
  {
    icon: Truck,
    eyebrow: 'Fulfillment',
    headline: 'Same-day dispatch from Waterloo, Ontario.',
    detail:
      'Tracked from Waterloo to your lab. Free shipping over $250 across Canada and the US.',
    href: '/shipping',
    cta: 'How We Ship',
  },
] as const;

const STATS = [
  { label: 'Avg Purity', value: '>99%' },
  { label: 'Testing', value: 'Janoshik' },
  { label: 'Dispatch', value: 'Same day' },
  { label: 'Origin', value: 'Waterloo, CA' },
] as const;

const QUICK_FAQ = [
  {
    question: 'What is Revalin?',
    answer:
      'Revalin is a Canadian research peptide supplier based in Waterloo, Ontario, providing independently tested, lab-grade peptides for qualified research institutions and professionals conducting in-vitro and pre-clinical research.',
  },
  {
    question: 'Are Revalin peptides for human use?',
    answer:
      'No. All Revalin products are sold exclusively for lawful in-vitro and pre-clinical research purposes. They are not intended for human consumption, veterinary use, or any clinical application.',
  },
  {
    question: 'Who tests Revalin research peptides?',
    answer:
      'All Revalin research peptides are independently tested by Janoshik Analytical, a third-party laboratory specializing in peptide purity and identity verification. Every batch ships with a Certificate of Analysis traceable to the original lab report.',
  },
  {
    question: 'How can I verify product purity?',
    answer:
      'Every batch is tested by Janoshik Analytical. Certificates of Analysis are published openly on our COA page with verification keys you can confirm directly with the testing lab.',
  },
  {
    question: 'What is a Certificate of Analysis (COA)?',
    answer:
      'A Certificate of Analysis is a lab-issued document confirming the purity, identity, and quality of a research peptide. Revalin publishes a COA for every batch with a verification key that can be cross-checked directly with Janoshik Analytical.',
  },
  {
    question: 'Where does Revalin ship?',
    answer:
      'Revalin ships research peptides across Canada and the United States. Orders placed before the daily cutoff are dispatched same-day with full tracking, and free shipping is available on orders over $250.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: QUICK_FAQ.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answer,
    },
  })),
};

export function ValidationSection() {
  return (
    <section
      id="validation"
      aria-labelledby="validation-heading"
      className="border-t border-black/10 bg-[#E8E1D4] px-sides py-10 text-[#0B2E2F] md:py-14"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mx-auto max-w-[1600px]">
        <div className="grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
          {/* Headline block */}
          <div className="space-y-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
              Validation
            </p>
            <h2
              id="validation-heading"
              className="max-w-xl text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]"
            >
              Proof, not promises.
            </h2>
            <p className="max-w-md text-base italic leading-relaxed text-[#0B2E2F]/72">
              Independently tested. Openly published. Shipped the same day.
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
              Revalin is a Canadian research peptide supplier based in Waterloo, Ontario. Every
              compound we ship is independently tested by Janoshik Analytical, published with an
              open Certificate of Analysis, and dispatched same-day to qualified researchers
              across Canada and the United States. Lab-grade material for in-vitro and pre-clinical
              research — documented on record, not on a landing page.
            </p>
          </div>

          {/* Stats — 2x2 green anchor chips */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {STATS.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-[12px] p-4 text-[#F4F1EA]"
                style={{ backgroundColor: '#0B2E2F' }}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#F4F1EA]/55">
                  {label}
                </p>
                <p className="mt-3 text-2xl tracking-[-0.04em] md:text-[1.75rem]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature panels — flat icons, no circle wrappers */}
        <div className="mt-10 grid gap-3 md:mt-14 md:grid-cols-3 md:gap-4">
          {VALIDATION_PANELS.map(({ icon: Icon, eyebrow, headline, detail, href, cta }) => (
            <article
              key={eyebrow}
              className="flex h-full flex-col justify-between rounded-[12px] border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-5"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#0B2E2F]/80">
                  <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  <p className="text-[10px] uppercase tracking-[0.22em]">{eyebrow}</p>
                </div>
                <h3 className="text-base leading-snug tracking-[-0.03em] md:text-[1.15rem]">
                  {headline}
                </h3>
                <p className="text-sm leading-relaxed text-[#0B2E2F]/68">{detail}</p>
              </div>

              <Link
                href={href}
                className="mt-6 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/70 transition-colors hover:text-[#0B2E2F]"
              >
                {cta}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        {/* Frequently Asked Questions — semantic h3 + FAQPage JSON-LD above */}
        <div
          id="faq"
          className="mt-10 border-t border-[#0B2E2F]/10 pt-8 md:mt-14 md:pt-10"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
              Frequently Asked Questions
            </h3>
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/55 transition-colors hover:text-[#0B2E2F]"
            >
              View All
              <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {QUICK_FAQ.map((item, i) => (
              <details
                key={i}
                className="group rounded-[12px] border border-[#0B2E2F]/12 bg-[#F4F1EA]/78"
              >
                <summary className="cursor-pointer select-none list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <h4 className="flex items-center justify-between gap-3 text-sm font-medium leading-tight">
                    <span>{item.question}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-base leading-none text-[#0B2E2F]/40 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </h4>
                </summary>
                <div className="px-4 pb-4 text-sm leading-relaxed text-[#0B2E2F]/68">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
