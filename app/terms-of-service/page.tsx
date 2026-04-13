import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';
import { RESEARCH_USE_MINIMUM_AGE, RESEARCH_USE_TERMS_LAST_UPDATED_LABEL } from '@/lib/compliance';

export const metadata: Metadata = {
  title: 'Terms of Service | Revalin',
  description:
    'Terms of Service for Revalin research products, including purchase eligibility, prohibited uses, and compliance obligations.',
  alternates: {
    canonical: '/terms-of-service',
  },
};

const KEY_POINTS = [
  'Products are strictly for lawful in-vitro and pre-clinical research.',
  'No human or veterinary use, administration, or therapeutic application.',
  'Orders may be canceled if misuse, fraud, or compliance risk is detected.',
  'Buyers must be qualified purchasers with lawful handling capability.',
];

const SECTION_LINKS = [
  { label: 'Scope', href: '#scope' },
  { label: 'Research-Only Products', href: '#research-only-products' },
  { label: 'Buyer Eligibility', href: '#buyer-eligibility' },
  { label: 'Prohibited Conduct', href: '#prohibited-conduct' },
  { label: 'Payment & Risk Controls', href: '#payment-and-risk-controls' },
  { label: 'Disclaimers & Liability', href: '#disclaimers-and-liability' },
  { label: 'Contact', href: '#contact' },
];

export default function TermsOfServicePage() {
  return (
    <PageLayout>
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <LegalSidebar
          className="col-span-3 max-md:hidden"
          title="Terms"
          subtitle="Research-use terms for all Revalin orders."
          keyPoints={KEY_POINTS}
          sectionLinks={SECTION_LINKS}
        />

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: {RESEARCH_USE_TERMS_LAST_UPDATED_LABEL}</p>

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
              <h2 id="scope" className="text-xl md:text-2xl font-semibold scroll-mt-24">1. Scope</h2>
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Revalin website and any
                products purchased from Revalin. By accessing this site or placing an order, you agree to these Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="research-only-products" className="text-xl md:text-2xl font-semibold scroll-mt-24">2. Research-Only Products</h2>
              <p>
                All products sold by Revalin are supplied strictly for lawful in-vitro and pre-clinical laboratory
                research only.
              </p>
              <p>
                Revalin does not condone, authorize, or support any human use, veterinary use, ingestion, injection,
                topical use, therapeutic application, self-experimentation, bodybuilding use, performance-enhancement
                use, weight-loss use, or compounding for patient administration.
              </p>
              <p>
                Products are not sold as foods, supplements, cosmetics, drugs, or medical devices. Revalin does not
                provide medical advice, prescriptions, treatment recommendations, or dosing guidance.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="buyer-eligibility" className="text-xl md:text-2xl font-semibold scroll-mt-24">3. Buyer Eligibility</h2>
              <p>By purchasing from Revalin, you represent and warrant that you:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Are at least {RESEARCH_USE_MINIMUM_AGE}+ years of age.</li>
                <li>
                  Are a qualified purchaser acting on behalf of a legitimate research organization, laboratory, or
                  other lawful research operation.
                </li>
                <li>
                  Have appropriate facilities, trained personnel, and safety controls for handling research chemicals.
                </li>
                <li>Will comply with all applicable federal, state, provincial, and local laws and regulations.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 id="prohibited-conduct" className="text-xl md:text-2xl font-semibold scroll-mt-24">4. Prohibited Conduct</h2>
              <p>You agree not to use, purchase, resell, or distribute products for any prohibited purpose, including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Human or veterinary administration of any kind.</li>
                <li>Clinical, therapeutic, diagnostic, or consumer use.</li>
                <li>Any unlawful activity, including misbranding or illegal resale.</li>
                <li>Any activity intended to evade card-network, bank, or payment-provider compliance requirements.</li>
              </ul>
              <p>
                Revalin may refuse, cancel, or limit any order at its sole discretion where an order appears
                inconsistent with these Terms, lawful research use, or payment/compliance requirements.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="payment-and-risk-controls" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                5. Orders, Verification, and Payment Risk Controls
              </h2>
              <p>
                Revalin may request additional business or identity verification before accepting or shipping an order.
                We may delay, reject, or cancel transactions that trigger compliance, fraud, sanctions, or misuse
                screening.
              </p>
              <p>
                You are responsible for providing accurate order and billing information. Fraudulent or unauthorized
                payment activity may be reported to relevant processors, financial institutions, and authorities.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">6. No Regulatory or Medical Claims</h2>
              <p>
                Unless explicitly stated in writing, products are not evaluated or approved by the U.S. Food and Drug
                Administration for human or veterinary use. Any informational content on this site is for general
                research context only and does not constitute medical, legal, or regulatory advice.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="disclaimers-and-liability" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                7. Disclaimers and Limitation of Liability
              </h2>
              <p>
                The site and products are provided &quot;as is&quot; and &quot;as available&quot; to the maximum extent permitted by law.
                Revalin disclaims all implied warranties, including merchantability, fitness for a particular purpose,
                and non-infringement.
              </p>
              <p>
                To the maximum extent permitted by law, Revalin will not be liable for indirect, incidental, special,
                consequential, or punitive damages arising from use of the site or products.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">8. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold harmless Revalin and its affiliates from any claims, losses,
                liabilities, and expenses arising from your breach of these Terms, violation of law, or prohibited use
                of products.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">9. Changes to These Terms</h2>
              <p>
                Revalin may update these Terms at any time by posting a revised version on this page. Continued use of
                the site after updates are posted constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="contact" className="text-xl md:text-2xl font-semibold scroll-mt-24">10. Contact</h2>
              <p>
                For compliance or policy questions, contact us through the channels listed on the website footer.
                Please also review our{' '}
                <Link className="underline underline-offset-4" href="/privacy-policy">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
