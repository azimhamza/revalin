import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';

export const metadata: Metadata = {
  title: 'Privacy Policy | Revalin',
  description:
    'Privacy Policy for Revalin, including data collection, payment processing, fraud/compliance screening, and user rights.',
  alternates: {
    canonical: '/privacy-policy',
  },
};

const KEY_POINTS = [
  'We collect only data needed for orders, support, security, and compliance.',
  'Payment and fraud/risk checks are handled with secure processing partners.',
  'We do not sell personal information for cash consideration.',
  'Data may be retained for legal, tax, dispute, and anti-fraud obligations.',
];

const SECTION_LINKS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Information We Collect', href: '#information-we-collect' },
  { label: 'How We Use Information', href: '#how-we-use-information' },
  { label: 'Sharing', href: '#sharing-of-information' },
  { label: 'Retention & Security', href: '#data-retention' },
  { label: 'Your Rights', href: '#your-rights-and-choices' },
  { label: 'Contact', href: '#contact' },
];

export default function PrivacyPolicyPage() {
  return (
    <PageLayout>
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <LegalSidebar
          className="col-span-3 max-md:hidden"
          title="Privacy"
          subtitle="How Revalin handles customer, order, and compliance data."
          keyPoints={KEY_POINTS}
          sectionLinks={SECTION_LINKS}
        />

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: March 13, 2026</p>

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
              <h2 id="overview" className="text-xl md:text-2xl font-semibold scroll-mt-24">1. Overview</h2>
              <p>
                This Privacy Policy explains how Revalin collects, uses, shares, and protects personal information when
                you use our website or place orders for research-use products.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="information-we-collect" className="text-xl md:text-2xl font-semibold scroll-mt-24">2. Information We Collect</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  Contact information: name, company or organization name, shipping/billing addresses, email, and
                  phone number.
                </li>
                <li>
                  Order and account information: products ordered, order history, and customer service communications.
                </li>
                <li>
                  Transaction-related information: payment method details and transaction metadata processed through
                  secure payment providers.
                </li>
                <li>Technical information: IP address, browser/device data, and analytics/cookie data.</li>
                <li>
                  Verification and compliance information: data reasonably required to screen for fraud, misuse, or
                  unlawful or prohibited transactions.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 id="how-we-use-information" className="text-xl md:text-2xl font-semibold scroll-mt-24">3. How We Use Information</h2>
              <p>We use personal information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process and fulfill orders.</li>
                <li>Provide customer support and operational communications.</li>
                <li>Detect, prevent, and investigate fraud, abuse, chargebacks, and policy violations.</li>
                <li>Conduct lawful research-use compliance checks and payment risk screening.</li>
                <li>Improve website performance, security, and user experience.</li>
                <li>Send marketing communications where permitted, with opt-out controls.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 id="sharing-of-information" className="text-xl md:text-2xl font-semibold scroll-mt-24">4. Sharing of Information</h2>
              <p>We may share information with:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Payment processors, banking partners, and fraud-prevention/risk providers.</li>
                <li>Shipping and logistics providers.</li>
                <li>Service providers supporting hosting, analytics, communications, and operations.</li>
                <li>Regulators, law enforcement, or legal authorities when required by law or valid legal process.</li>
              </ul>
              <p>
                We do not sell personal information for cash consideration. We only disclose information as reasonably
                necessary for operations, legal obligations, and compliance protections.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">5. Cookies and Analytics</h2>
              <p>
                We use cookies and similar technologies for core site functionality, analytics, and security. You can
                adjust browser settings to manage cookies; however, disabling some cookies may affect site
                functionality.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="data-retention" className="text-xl md:text-2xl font-semibold scroll-mt-24">6. Data Retention</h2>
              <p>
                We retain personal information for as long as needed to provide services, maintain required business
                records, meet legal and tax obligations, resolve disputes, enforce our terms, and support fraud/risk
                controls.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">7. Security</h2>
              <p>
                We use commercially reasonable administrative, technical, and organizational safeguards to protect
                personal information. No method of transmission or storage is guaranteed to be fully secure.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="your-rights-and-choices" className="text-xl md:text-2xl font-semibold scroll-mt-24">8. Your Rights and Choices</h2>
              <p>
                Depending on your jurisdiction, you may have rights to request access, correction, deletion, or
                limitation of certain processing of your personal information. You may also opt out of marketing emails
                using the unsubscribe link in those messages.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">9. Cross-Border Processing</h2>
              <p>
                Your information may be processed in jurisdictions that may have different data-protection laws than
                your place of residence. We take reasonable steps to protect transferred information.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">10. Policy Updates</h2>
              <p>
                We may update this Privacy Policy from time to time. The updated version will be posted on this page
                with a revised &quot;Last updated&quot; date.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="contact" className="text-xl md:text-2xl font-semibold scroll-mt-24">11. Contact</h2>
              <p>
                For privacy or compliance questions, contact us through the channels listed on the website footer.
                Please also review our{' '}
                <Link className="underline underline-offset-4" href="/terms-of-service">
                  Terms of Service
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
