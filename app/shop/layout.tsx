import type { Metadata } from 'next';
import { DesktopFilters } from './components/shop-filters';
import { Suspense } from 'react';
import { getCollections } from '@/lib/swell';
import { PageLayout } from '@/components/layout/page-layout';
import { MobileFilters } from './components/mobile-filters';
import { MobileQuickSearch } from './components/mobile-quick-search';
import { ProductsProvider } from './providers/products-provider';

// Keep a stable title at the segment level so /shop navigations do not fall back
// to Next's default untitled state while the page content streams in.
export const metadata: Metadata = {
  title: 'Revalin | Shop',
  description:
    'Shop Revalin research peptides for legitimate laboratory and pre-clinical studies. Purchase from a trusted research product distributor.',
  keywords: [
    'peptide shop',
    'research peptides purchase',
    'buy research peptides',
    'peptide distributor',
    'research chemical supplier',
    'laboratory peptide products',
  ],
};

// Enable ISR with 1 minute revalidation for the layout
export const revalidate = 60;

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const collections = await getCollections();

  return (
    <PageLayout>
      <ProductsProvider>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <Suspense fallback={null}>
            <DesktopFilters collections={collections} className="col-span-3 max-md:hidden" />
          </Suspense>
          <Suspense fallback={null}>
            <MobileFilters collections={collections} />
          </Suspense>
          <div className="col-span-9 flex flex-col h-full md:pt-top-spacing">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </div>
        <MobileQuickSearch />
      </ProductsProvider>
    </PageLayout>
  );
}
