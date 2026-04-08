import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { LegalSidebar } from '@/components/layout/sidebar/legal-sidebar';

export const metadata: Metadata = {
  title: 'Shipping & Returns | Revalin',
  description:
    'Shipping regions, delivery times, free shipping policy, and return/exchange information for Revalin research products.',
  alternates: {
    canonical: '/shipping',
  },
};

const KEY_POINTS = [
  'Ships same-day from Canada.',
  'Free shipping on orders over $250.',
  'Delivery to Canada and the United States.',
  'Damaged items replaced within 48 hours of report.',
];

const SECTION_LINKS = [
  { label: 'Shipping Regions', href: '#shipping-regions' },
  { label: 'Delivery Times', href: '#delivery-times' },
  { label: 'Free Shipping', href: '#free-shipping' },
  { label: 'Returns & Exchanges', href: '#returns-and-exchanges' },
  { label: 'Damaged Items', href: '#damaged-items' },
];

export default function ShippingPage() {
  return (
    <PageLayout>
      <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
        <LegalSidebar
          className="col-span-3 max-md:hidden"
          title="Shipping"
          subtitle="Delivery and return policies for Revalin orders."
          keyPoints={KEY_POINTS}
          sectionLinks={SECTION_LINKS}
        />

        <section className="col-span-9 p-sides pb-14 md:pr-sides md:pt-top-spacing">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Shipping & Returns</h1>

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
              <h2 id="shipping-regions" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Shipping Regions
              </h2>
              <p>
                Revalin ships from Canada to destinations within Canada and the United States. We currently do not
                offer international shipping outside of these two regions. All shipments comply with applicable
                domestic shipping regulations for research materials.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="delivery-times" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Delivery Times
              </h2>
              <p>
                Orders placed before the daily processing cutoff are dispatched same day. Standard delivery typically
                takes 2–5 business days depending on your location. Tracking information is provided for every order
                via email once your shipment has been dispatched.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="free-shipping" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Free Shipping
              </h2>
              <p>
                Orders totaling $250 or more qualify for free standard shipping. This applies to all eligible
                destinations within Canada and the United States. No coupon code is required — the discount is applied
                automatically at checkout.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="returns-and-exchanges" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Returns & Exchanges
              </h2>
              <p>
                Due to the nature of research chemicals, we cannot accept returns on opened or used products.
                Unopened products in their original sealed packaging may be returned within 14 days of delivery for a
                full refund. Please contact us before shipping any returns to receive a return authorization.
              </p>
            </section>

            <section className="space-y-3">
              <h2 id="damaged-items" className="text-xl md:text-2xl font-semibold scroll-mt-24">
                Damaged Items
              </h2>
              <p>
                If your order arrives damaged or you received an incorrect item, contact us at support@revalin.ca
                within 48 hours of delivery. Please include your order number and photos of the damage. We will
                arrange a replacement shipment or full refund at no additional cost.
              </p>
            </section>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
