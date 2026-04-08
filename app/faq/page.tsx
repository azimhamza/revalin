import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';

export const metadata: Metadata = {
  title: 'FAQ | Revalin',
  description:
    'Frequently asked questions about Revalin research peptides, purity verification, shipping, returns, and payment.',
  alternates: {
    canonical: '/faq',
  },
};

const KEY_POINTS = [
  'Products are for in-vitro and pre-clinical research only.',
  'Every batch is independently tested with published COAs.',
  'Ships same-day from Canada to CA & US.',
  'Free shipping on orders over $250.',
];

const FAQ_ITEMS = [
  {
    question: 'What is Revalin?',
    answer:
      'Revalin is a Canadian research peptide supplier. We provide lab-grade peptides for qualified research institutions, laboratories, and professionals conducting in-vitro and pre-clinical research. Every product we sell is independently tested and comes with a published Certificate of Analysis.',
  },
  {
    question: 'Are these products for human use?',
    answer:
      'No. All Revalin products are sold exclusively for lawful in-vitro and pre-clinical research purposes. They are not intended for human consumption, veterinary use, therapeutic application, or any clinical purpose. Buyers must be qualified purchasers with appropriate research facilities.',
  },
  {
    question: 'How can I verify product purity?',
    answer:
      'Every batch we sell is tested by Janoshik Analytical, an independent third-party laboratory. Certificates of Analysis are published on our COA page with verification keys that allow you to confirm results directly with the testing lab. Our average purity across all compounds exceeds 99%.',
  },
  {
    question: 'Where do you ship and how long does delivery take?',
    answer:
      'We ship from Canada to addresses in Canada and the United States. Orders placed before the daily cutoff ship same day. Standard delivery typically takes 2–5 business days depending on destination. Tracking is provided for all orders.',
  },
  {
    question: 'What is your return and exchange policy?',
    answer:
      'Due to the nature of research chemicals, we cannot accept returns on opened products. If your order arrives damaged or you received the wrong item, contact us within 48 hours with photos and we will arrange a replacement or refund. Unopened products may be returned within 14 days of delivery.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept major credit and debit cards processed through our secure payment partner. All transactions are encrypted and comply with payment processor requirements. Orders may be subject to verification for compliance purposes.',
  },
  {
    question: 'How can I contact Revalin?',
    answer:
      'You can reach us by email at support@revalin.ca. We are based in Canada and typically respond within one business day. For order-specific inquiries, please include your order number.',
  },
];

const SECTION_LINKS = FAQ_ITEMS.map((item, index) => ({
  label: item.question,
  href: `#faq-${index}`,
}));

export default function FaqPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <PageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <LegalSidebar
          className="col-span-3 max-md:hidden"
          title="FAQ"
          subtitle="Common questions about Revalin products and policies."
          keyPoints={KEY_POINTS}
          sectionLinks={SECTION_LINKS}
        />

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Frequently Asked Questions</h1>

          <div className="mt-6 md:hidden rounded border border-foreground/15 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Key Points</p>
            <ul className="mt-3 pl-4 space-y-2 text-sm leading-tight list-disc">
              {KEY_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="mt-10 max-w-4xl space-y-4">
            {FAQ_ITEMS.map((item, index) => (
              <details
                key={index}
                id={`faq-${index}`}
                className="group scroll-mt-24 rounded border border-foreground/15 bg-[#EBE7DC] open:bg-[#EBE7DC]"
              >
                <summary className="cursor-pointer select-none px-5 py-4 text-sm md:text-base font-semibold leading-tight list-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.question}
                    <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45 text-lg leading-none">
                      +
                    </span>
                  </span>
                </summary>
                <div className="px-5 pb-5 text-sm md:text-base leading-relaxed text-foreground/85">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
