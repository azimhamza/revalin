import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';
import { RESEARCH_USE_MINIMUM_AGE, RESEARCH_USE_TERMS_LAST_UPDATED_LABEL } from '@/lib/compliance';

export const metadata: Metadata = {
  title: 'Terms of Service | Revalin',
  description:
    'Terms of Service for Revalin research products, including purchase eligibility, prohibited uses, compliance obligations, and liability.',
  alternates: {
    canonical: '/terms-of-service',
  },
};

const KEY_POINTS = [
  'Products are strictly for lawful in-vitro and pre-clinical research.',
  'Not intended for human or animal consumption.',
  'Not evaluated or approved by Health Canada or the FDA.',
  'Buyer assumes all responsibility for use after purchase.',
  'Revalin reserves the right to refuse or cancel any order.',
];

const SECTION_LINKS = [
  { label: 'Definitions', href: '#definitions' },
  { label: 'Eligibility', href: '#eligibility' },
  { label: 'Nature of Products', href: '#nature-of-products' },
  { label: 'Buyer Representations', href: '#buyer-representations' },
  { label: 'Prohibited Conduct', href: '#prohibited-conduct' },
  { label: 'Assumption of Risk', href: '#assumption-of-risk' },
  { label: 'Limitation of Liability', href: '#limitation-of-liability' },
  { label: 'Indemnification', href: '#indemnification' },
  { label: 'Regulatory Compliance', href: '#regulatory-compliance' },
  { label: 'No Professional Advice', href: '#no-professional-advice' },
  { label: 'Orders & Payment', href: '#orders-and-payment' },
  { label: 'Shipping & Import', href: '#shipping-and-import' },
  { label: 'Returns & Refunds', href: '#returns-and-refunds' },
  { label: 'Intellectual Property', href: '#intellectual-property' },
  { label: 'Privacy & Data', href: '#privacy-and-data' },
  { label: 'Governing Law', href: '#governing-law' },
  { label: 'Amendments', href: '#amendments' },
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

          <div className="mt-10 max-w-4xl space-y-10 text-sm md:text-base leading-relaxed">
            {/* 1. Definitions */}
            <section className="space-y-3">
              <h2 id="definitions" className="text-xl md:text-2xl font-semibold scroll-mt-24">1. Definitions</h2>
              <p>
                Throughout these Terms of Service (&quot;Terms&quot;), the following definitions apply:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li><strong>&quot;Revalin&quot;</strong> or <strong>&quot;Company&quot;</strong> refers to Revalin and its affiliates, operating under Canadian jurisdiction.</li>
                <li><strong>&quot;Products&quot;</strong> refers to all research chemicals, peptides, and related materials sold through the Revalin website.</li>
                <li><strong>&quot;Research purposes&quot;</strong> means lawful in-vitro experimentation, pre-clinical laboratory research, analytical testing, or other non-clinical scientific investigation.</li>
                <li><strong>&quot;Qualified researcher&quot;</strong> means an individual who possesses appropriate training, facilities, and institutional oversight to handle research chemicals in accordance with applicable safety standards.</li>
                <li><strong>&quot;Laboratory use&quot;</strong> means use within a controlled research environment with proper safety equipment, protocols, and waste disposal procedures.</li>
                <li><strong>&quot;Buyer&quot;</strong> or <strong>&quot;you&quot;</strong> refers to any person or entity that accesses the Revalin website or purchases Products.</li>
              </ul>
              <p>
                By accessing this website or placing an order, you acknowledge that you have read, understood, and agree to be bound by these Terms in their entirety.
              </p>
            </section>

            {/* 2. Eligibility */}
            <section className="space-y-3">
              <h2 id="eligibility" className="text-xl md:text-2xl font-semibold scroll-mt-24">2. Eligibility and Access Restrictions</h2>
              <p>To purchase from Revalin, you must meet all of the following requirements:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>You are at least {RESEARCH_USE_MINIMUM_AGE} years of age.</li>
                <li>You are a qualified researcher or are acting on behalf of a legitimate research institution, laboratory, or other lawful research operation.</li>
                <li>You are not located in a jurisdiction where the purchase, possession, or use of the Products is prohibited or restricted by law.</li>
                <li>All information you provide during registration and checkout is accurate and truthful.</li>
              </ul>
              <p>
                Revalin reserves the right to refuse service to any person or entity, at its sole discretion, without obligation to provide a reason. False representation of eligibility voids all protections under these Terms and transfers full responsibility and liability to the buyer.
              </p>
            </section>

            {/* 3. Nature of Products */}
            <section className="space-y-3">
              <h2 id="nature-of-products" className="text-xl md:text-2xl font-semibold scroll-mt-24">3. Nature of Products</h2>
              <p>
                All Products sold by Revalin are research chemicals supplied exclusively for in-vitro and laboratory research purposes. By purchasing, you acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Products are <strong>not intended for human or animal consumption</strong>.</li>
                <li>Products are not intended for clinical, therapeutic, diagnostic, or cosmetic use.</li>
                <li>Products have <strong>not been evaluated or approved by Health Canada, the U.S. Food and Drug Administration (FDA), or any other regulatory authority</strong> for safety or efficacy in humans or animals.</li>
                <li>Products are not sold as foods, dietary supplements, drugs, medical devices, or natural health products.</li>
                <li>Chemical composition may vary between batches within the tolerances documented on Certificates of Analysis.</li>
                <li>Products are not guaranteed to be sterile unless explicitly stated on the product listing.</li>
                <li>Revalin makes no claims regarding the safety, efficacy, or fitness of any Product for any particular purpose.</li>
              </ul>
            </section>

            {/* 4. Buyer Representations and Warranties */}
            <section className="space-y-3">
              <h2 id="buyer-representations" className="text-xl md:text-2xl font-semibold scroll-mt-24">4. Buyer Representations and Warranties</h2>
              <p>
                By placing an order, you explicitly represent and warrant that:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>You are a qualified researcher with relevant training and expertise in handling research chemicals.</li>
                <li>You have access to appropriate facilities, safety equipment, and trained personnel for the handling, storage, and disposal of research chemicals.</li>
                <li>You will use Products exclusively for lawful research purposes as defined in these Terms.</li>
                <li>You will not administer, apply, or otherwise use Products on humans or animals.</li>
                <li>You will not resell, redistribute, or transfer Products to consumers or to any party that does not meet the eligibility requirements outlined in these Terms.</li>
                <li>You will comply with all applicable federal, provincial, state, and local laws and regulations governing the purchase, possession, handling, and use of research chemicals in your jurisdiction.</li>
                <li>All information provided during account registration, checkout, and any verification process is accurate, current, and truthful.</li>
                <li>You understand the regulatory status of the Products in your jurisdiction and accept full responsibility for ensuring compliance.</li>
              </ul>
            </section>

            {/* 5. Prohibited Conduct */}
            <section className="space-y-3">
              <h2 id="prohibited-conduct" className="text-xl md:text-2xl font-semibold scroll-mt-24">5. Prohibited Conduct</h2>
              <p>You agree not to use, purchase, resell, or distribute Products for any prohibited purpose, including but not limited to:</p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Human or veterinary administration, ingestion, injection, or topical application of any kind.</li>
                <li>Clinical, therapeutic, diagnostic, or consumer use.</li>
                <li>Self-experimentation, bodybuilding, performance enhancement, weight loss, or compounding for patient administration.</li>
                <li>Resale to consumers or any unauthorized redistribution.</li>
                <li>Any unlawful activity, including misbranding, illegal resale, or circumvention of regulatory controls.</li>
                <li>Any activity intended to evade card-network, bank, or payment-provider compliance requirements.</li>
              </ul>
              <p>
                Revalin may refuse, cancel, or limit any order at its sole discretion where an order appears inconsistent with these Terms, lawful research use, or payment and compliance requirements.
              </p>
            </section>

            {/* 6. Assumption of Risk */}
            <section className="space-y-3">
              <h2 id="assumption-of-risk" className="text-xl md:text-2xl font-semibold scroll-mt-24">6. Assumption of Risk</h2>
              <p>
                By purchasing Products from Revalin, you expressly acknowledge and assume all risks associated with the purchase, handling, storage, transport, and use of research chemicals, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Risks inherent in handling research chemicals, including potential hazards from improper use, storage, or disposal.</li>
                <li>Any outcomes, adverse or otherwise, resulting from the use or misuse of Products.</li>
                <li>Any regulatory, legal, or enforcement action arising from your possession or use of Products.</li>
              </ul>
              <p>
                Revalin is not responsible for any consequences resulting from the use of Products after delivery. The transfer of risk is complete upon delivery to the carrier or to your designated shipping address.
              </p>
            </section>

            {/* 7. Limitation of Liability */}
            <section className="space-y-3">
              <h2 id="limitation-of-liability" className="text-xl md:text-2xl font-semibold scroll-mt-24">7. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by applicable law:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Revalin&apos;s total liability for any claim arising from or related to these Terms or any Product shall not exceed the purchase price of the specific order giving rise to the claim.</li>
                <li>Revalin shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or goodwill.</li>
                <li>Revalin shall not be liable for personal injury, death, or property damage arising from the use or misuse of Products.</li>
                <li>Revalin shall not be liable for any regulatory or enforcement action taken against the buyer.</li>
                <li>Revalin shall not be liable for any third-party claims arising from the buyer&apos;s use of Products.</li>
              </ul>
              <p>
                The site and Products are provided &quot;as is&quot; and &quot;as available.&quot; Revalin disclaims all implied warranties, including warranties of merchantability, fitness for a particular purpose, and non-infringement. These limitations apply regardless of whether Revalin was advised of the possibility of such damages.
              </p>
            </section>

            {/* 8. Indemnification */}
            <section className="space-y-3">
              <h2 id="indemnification" className="text-xl md:text-2xl font-semibold scroll-mt-24">8. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold harmless Revalin, its directors, officers, employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from or related to:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Your breach of any provision of these Terms.</li>
                <li>Your use or misuse of Products.</li>
                <li>Any regulatory or enforcement action resulting from your conduct.</li>
                <li>Any third-party claims related to your use, handling, or distribution of Products.</li>
                <li>Your violation of any applicable law or regulation.</li>
              </ul>
              <p>
                This indemnification obligation survives the termination of your account and the completion of any transaction.
              </p>
            </section>

            {/* 9. Regulatory Compliance */}
            <section className="space-y-3">
              <h2 id="regulatory-compliance" className="text-xl md:text-2xl font-semibold scroll-mt-24">9. Regulatory Compliance</h2>
              <p>
                You are solely responsible for understanding and complying with the legal and regulatory requirements governing the purchase, import, possession, and use of research chemicals in your jurisdiction.
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Revalin makes no representations regarding the legality of Products in any particular jurisdiction.</li>
                <li>Compliance with all export, import, and customs regulations is entirely your responsibility.</li>
                <li>Purchases from jurisdictions where Products are restricted or prohibited are made at the buyer&apos;s own risk and responsibility.</li>
                <li>Revalin reserves the right to refuse orders to certain jurisdictions at its sole discretion.</li>
              </ul>
            </section>

            {/* 10. No Professional Advice */}
            <section className="space-y-3">
              <h2 id="no-professional-advice" className="text-xl md:text-2xl font-semibold scroll-mt-24">10. No Medical, Scientific, or Professional Advice</h2>
              <p>
                Nothing on the Revalin website or in any communication from Revalin constitutes medical, scientific, legal, or professional advice.
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Revalin employees and representatives are not medical professionals and do not provide health-related guidance.</li>
                <li>No information on this site should be interpreted as dosing, usage, safety, or application guidance for humans or animals.</li>
                <li>Product descriptions and research information are provided for identification and general educational context only.</li>
                <li>You should consult qualified professionals for any research application or compliance question.</li>
              </ul>
            </section>

            {/* 11. Orders and Payment */}
            <section className="space-y-3">
              <h2 id="orders-and-payment" className="text-xl md:text-2xl font-semibold scroll-mt-24">11. Orders, Verification, and Payment</h2>
              <p>
                Revalin may request additional business or identity verification before accepting or shipping an order. We may delay, reject, or cancel transactions that trigger compliance, fraud, sanctions, or misuse screening.
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Revalin may refuse or cancel any order at its sole discretion, without obligation to provide a reason.</li>
                <li>Orders may be cancelled if the buyer misrepresents their eligibility or provides inaccurate information.</li>
                <li>You are responsible for providing accurate order, billing, and shipping information.</li>
                <li>Fraudulent or unauthorized payment activity may be reported to relevant processors, financial institutions, and authorities.</li>
                <li>Revalin may terminate account access for any violation of these Terms.</li>
              </ul>
            </section>

            {/* 12. Shipping and Import */}
            <section className="space-y-3">
              <h2 id="shipping-and-import" className="text-xl md:text-2xl font-semibold scroll-mt-24">12. Shipping and Import</h2>
              <p>
                Once Products are delivered to the shipping carrier, risk of loss transfers to you. With respect to shipping:
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>You are the importer of record in your jurisdiction for any international shipment.</li>
                <li>All customs duties, taxes, and import compliance requirements are your sole responsibility.</li>
                <li>Revalin is not liable for delays, seizures, or confiscation by customs or border authorities.</li>
                <li>No refunds will be issued for shipments seized by regulatory or customs authorities.</li>
                <li>You accept all risks associated with international shipping, including potential regulatory inspection.</li>
              </ul>
              <p>
                Domestic shipments include complimentary shipping insurance. Claims for lost or damaged packages must be submitted within the timeframe specified in our{' '}
                <Link className="underline underline-offset-4" href="/shipping">Shipping Policy</Link>.
              </p>
            </section>

            {/* 13. Returns and Refunds */}
            <section className="space-y-3">
              <h2 id="returns-and-refunds" className="text-xl md:text-2xl font-semibold scroll-mt-24">13. Returns and Refunds</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Due to the nature of research chemicals, Products are generally non-returnable once shipped.</li>
                <li>Damaged, defective, or incorrect orders will be addressed on a case-by-case basis.</li>
                <li>No refunds will be issued due to regulatory issues, legal restrictions, or customs actions in the buyer&apos;s jurisdiction.</li>
                <li>Refund requests must be submitted within 14 days of delivery.</li>
              </ul>
              <p>
                For specific questions regarding returns, please contact our support team.
              </p>
            </section>

            {/* 14. Intellectual Property */}
            <section className="space-y-3">
              <h2 id="intellectual-property" className="text-xl md:text-2xl font-semibold scroll-mt-24">14. Intellectual Property</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>All website content, including text, graphics, logos, and design, is the proprietary property of Revalin and is protected by applicable intellectual property laws.</li>
                <li>Product descriptions and documentation are provided for identification purposes only and may not be reproduced or distributed without permission.</li>
                <li>Any research findings, data, or publications resulting from the use of Revalin Products remain the intellectual property of the buyer.</li>
              </ul>
            </section>

            {/* 15. Privacy and Data */}
            <section className="space-y-3">
              <h2 id="privacy-and-data" className="text-xl md:text-2xl font-semibold scroll-mt-24">15. Privacy and Data</h2>
              <p>
                Your use of this site is also governed by our{' '}
                <Link className="underline underline-offset-4" href="/privacy-policy">Privacy Policy</Link>, which describes what information we collect, how it is stored, and how it may be used.
              </p>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>Information collected during account registration, verification, and checkout may be retained in accordance with our data retention policies.</li>
                <li>Information may be disclosed to regulatory authorities, law enforcement, or legal counsel if required by law, court order, or regulatory investigation.</li>
                <li>By making a purchase, you consent to the collection, storage, and potential disclosure of your information as described in our Privacy Policy.</li>
              </ul>
            </section>

            {/* 16. Governing Law and Dispute Resolution */}
            <section className="space-y-3">
              <h2 id="governing-law" className="text-xl md:text-2xl font-semibold scroll-mt-24">16. Governing Law and Dispute Resolution</h2>
              <ul className="list-disc pl-6 space-y-1.5">
                <li>These Terms are governed by and construed in accordance with the laws of the Province of Ontario, Canada, without regard to conflict of law principles.</li>
                <li>Any dispute arising from or related to these Terms shall first be subject to good-faith negotiation between the parties for a period of thirty (30) days.</li>
                <li>If negotiation is unsuccessful, disputes shall be resolved through binding arbitration in the Province of Ontario, Canada, in accordance with applicable arbitration rules.</li>
                <li>You agree to waive any right to participate in a class action lawsuit or class-wide arbitration against Revalin.</li>
                <li>If any provision of these Terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.</li>
              </ul>
            </section>

            {/* 17. Amendments */}
            <section className="space-y-3">
              <h2 id="amendments" className="text-xl md:text-2xl font-semibold scroll-mt-24">17. Amendments</h2>
              <p>
                Revalin reserves the right to update or modify these Terms at any time by posting a revised version on this page. The &quot;Last updated&quot; date at the top of this page reflects the most recent revision.
              </p>
              <p>
                Continued use of the site or placement of new orders after any update constitutes your acceptance of the revised Terms. For material changes, we may provide additional notice via email or site notification.
              </p>
            </section>

            {/* 18. Entire Agreement */}
            <section className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold scroll-mt-24">18. Entire Agreement</h2>
              <p>
                These Terms, together with our{' '}
                <Link className="underline underline-offset-4" href="/privacy-policy">Privacy Policy</Link> and any other policies referenced herein, constitute the entire agreement between you and Revalin regarding the subject matter hereof. These Terms supersede all prior or contemporaneous agreements, communications, and proposals, whether oral or written. No verbal or informal representations are binding.
              </p>
            </section>

            {/* 19. Contact */}
            <section className="space-y-3">
              <h2 id="contact" className="text-xl md:text-2xl font-semibold scroll-mt-24">19. Contact</h2>
              <p>
                For compliance, legal, or policy questions, contact us at{' '}
                <a className="underline underline-offset-4" href="mailto:support@revalin.ca">support@revalin.ca</a>.
                Please also review our{' '}
                <Link className="underline underline-offset-4" href="/privacy-policy">Privacy Policy</Link>.
              </p>
            </section>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
