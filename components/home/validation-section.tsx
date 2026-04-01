import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, ClipboardCheck, Truck, HelpCircle } from 'lucide-react';

const VALIDATION_PANELS = [
  {
    icon: ClipboardCheck,
    eyebrow: 'Testing',
    quote: 'Every batch we sell has been tested by Janoshik Analytical and published with a verification path.',
    detail: 'Open COAs. Verification keys. No request form, no gatekeeping.',
    href: '/coa',
    cta: 'Review COAs',
  },
  {
    icon: BadgeCheck,
    eyebrow: 'Purity',
    quote: 'The catalog is built around documented material quality, not loud claims or inflated language.',
    detail: '>99% average purity across active compounds, framed as proof instead of promotion.',
    href: '/about',
    cta: 'Why Revalin',
  },
  {
    icon: Truck,
    eyebrow: 'Fulfillment',
    quote: 'Orders are dispatched same-day before cutoff, tracked from origin, and handled to the same standard as the product inside.',
    detail: 'Canada-wide and US delivery with full tracking on every shipment.',
    href: '/shipping',
    cta: 'How We Ship',
  },
] as const;

const QUICK_FAQ = [
  {
    question: 'What is Revalin?',
    answer:
      'Revalin is a Canadian research peptide supplier providing lab-grade peptides for qualified research institutions and professionals conducting in-vitro and pre-clinical research.',
  },
  {
    question: 'Are these products for human use?',
    answer:
      'No. All products are sold exclusively for lawful in-vitro and pre-clinical research purposes. They are not intended for human consumption, veterinary use, or any clinical application.',
  },
  {
    question: 'How can I verify product purity?',
    answer:
      'Every batch is tested by Janoshik Analytical. Certificates of Analysis are published on our COA page with verification keys you can confirm directly with the testing lab.',
  },
  {
    question: 'Where do you ship?',
    answer:
      'We ship from Canada to addresses in Canada and the United States. Orders placed before the daily cutoff ship same day with full tracking.',
  },
] as const;

export function ValidationSection() {
  return (
    <section className="border-t border-black/10 bg-[#E8E1D4] px-sides py-10 md:py-14">
      <div className="mx-auto grid max-w-[1600px] gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-10">
        <div className="space-y-4 text-[#0B2E2F]">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">Validation</p>
          <h2 className="max-w-xl text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]">
            Trust should feel documented before it feels marketed.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
            Independent testing, published documentation, and consistent fulfillment — every order held to the
            same standard.
          </p>

          <div className="grid max-w-md gap-3 pt-2 text-[#0B2E2F] md:grid-cols-2">
            <div className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#0B2E2F]/55">Average Purity</p>
              <p className="mt-3 text-3xl tracking-[-0.05em]">&gt;99%</p>
            </div>
            <div className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#0B2E2F]/55">Dispatch Standard</p>
              <p className="mt-3 text-lg leading-tight tracking-[-0.03em]">Same-day before cutoff</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {VALIDATION_PANELS.map(({ icon: Icon, eyebrow, quote, detail, href, cta }) => (
            <article
              key={eyebrow}
              className="flex h-full flex-col justify-between border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-5 text-[#0B2E2F]"
            >
              <div className="space-y-5">
                <div className="flex size-10 items-center justify-center rounded-full border border-[#0B2E2F]/12 bg-white/70">
                  <Icon className="size-4" strokeWidth={1.5} />
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">{eyebrow}</p>
                  <blockquote className="text-base leading-tight tracking-[-0.03em] md:text-[1.15rem]">
                    “{quote}”
                  </blockquote>
                  <p className="text-sm leading-relaxed text-[#0B2E2F]/68">{detail}</p>
                </div>
              </div>

              <Link
                href={href}
                className="mt-6 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/76 transition-colors hover:text-[#0B2E2F]"
              >
                {cta}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
              </Link>
            </article>
          ))}
        </div>

        {/* Quick FAQ */}
        <div className="md:col-span-2 mt-4 md:mt-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="size-4 text-[#0B2E2F]/55" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">Quick FAQ</p>
            </div>
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#0B2E2F]/55 transition-colors hover:text-[#0B2E2F]"
            >
              View All
              <ArrowUpRight className="size-3" strokeWidth={1.5} />
            </Link>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {QUICK_FAQ.map((item, i) => (
              <details
                key={i}
                className="group border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 text-[#0B2E2F]"
              >
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium leading-tight list-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.question}
                    <span className="shrink-0 text-[#0B2E2F]/40 transition-transform group-open:rotate-45 text-base leading-none">
                      +
                    </span>
                  </span>
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
