import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';

export const metadata: Metadata = {
  title: 'About | Revalin',
  description:
    'Revalin is a research peptide supplier built on transparency, independent testing, and rigorous chemistry standards.',
  alternates: {
    canonical: '/about',
  },
};

const KEY_POINTS = [
  'Independent third-party batch testing on every product.',
  'Certificates of Analysis included with every order.',
  '>99% average purity across all compounds.',
  'Built for researchers, not consumers.',
];

const SECTION_LINKS = [
  { label: 'Who We Are', href: '#who-we-are' },
  { label: 'Why We Exist', href: '#why-we-exist' },
  { label: 'What Makes Us Different', href: '#what-makes-us-different' },
];

export default function AboutPage() {
  return (
    <PageLayout>
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <LegalSidebar
          className="col-span-3 max-md:hidden"
          title="About"
          subtitle="Who Revalin is and what drives us."
          keyPoints={KEY_POINTS}
          sectionLinks={SECTION_LINKS}
        />

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">About Revalin</h1>

          <div className="mt-6 md:hidden rounded border border-foreground/15 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Key Points</p>
            <ul className="mt-3 pl-4 space-y-2 text-sm leading-tight list-disc">
              {KEY_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="mt-10 max-w-4xl space-y-8 text-sm md:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 id="who-we-are" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Who We Are
              </h2>
              <p>
                Revalin is a Canadian research peptide supplier serving qualified laboratories, academic institutions,
                and research professionals across North America. We source, test, and distribute research-grade
                peptides with one priority: verifiable quality.
              </p>
              <p>
                Every compound we carry is third-party tested by independent analytical laboratories. Certificates of
                Analysis are published for every batch — not behind a paywall, not on request, but openly on our site
                for anyone to verify.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="why-we-exist" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Why We Exist
              </h2>
              <p>
                The research peptide market has a trust problem. Many suppliers make claims they cannot substantiate,
                sell products without independent verification, or hide behind vague marketing language. Revalin was
                founded because researchers deserve better.
              </p>
              <p>
                We believe a lab report speaks louder than an advertisement. Our approach is straightforward: test
                everything independently, publish the results, and let the chemistry stand on its own. No inflated
                claims, no wellness language, no noise — just verified research materials for people who know what
                they are looking for.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="what-makes-us-different" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                What Makes Us Different
              </h2>
              <p>
                Every batch we sell has been tested by Janoshik Analytical — one of the most respected independent
                peptide testing laboratories in the world. Our published COAs include verification keys so anyone can
                confirm the results directly with the testing lab.
              </p>
              <p>
                We maintain an average purity above 99% across all compounds. We ship same-day from Canada, offer
                free shipping on orders over $250, and stand behind every product with full documentation. If the data
                does not meet our standards, we do not sell it.
              </p>
            </section>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
