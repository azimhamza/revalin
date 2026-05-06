import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageLayout } from '@/components/layout/page-layout';
import { isCardProcessingEnabled, isCardSquareFallbackEnabled } from '@/lib/checkout/payment-method-rules';
import { getProducts } from '@/lib/swell';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { CheckoutExperience } from './components/checkout-experience';

export const metadata: Metadata = {
  title: 'Checkout | Revalin',
  description: 'Secure crypto checkout for Revalin research orders.',
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const currencyCode = await resolveRequestCurrencyCode();
  const quickAddProducts = await getProducts({ limit: 8, currencyCode, live: true });
  const cardProcessingEnabled = isCardProcessingEnabled();
  const cardSquareFallbackEnabled = isCardSquareFallbackEnabled();

  return (
    <PageLayout className="bg-muted min-h-screen">
      <Suspense>
        <CheckoutExperience
          cardProcessingEnabled={cardProcessingEnabled}
          cardSquareFallbackEnabled={cardSquareFallbackEnabled}
          quickAddProducts={quickAddProducts}
        />
      </Suspense>
    </PageLayout>
  );
}
