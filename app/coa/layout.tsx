import { PageLayout } from '@/components/layout/page-layout';
import { COAProvider, Batch } from './providers/coa-provider';
import { COADesktopFilters } from './components/coa-filters';
import { COAMobileFilters } from './components/coa-mobile-filters';
import { getProducts } from '@/lib/swell/swell';
import { COA_BATCHES, PRODUCT_MATCH_TERMS } from '@/lib/coa-data';

function matchProductImage(
  productName: string,
  storeProducts: { title: string; handle: string; imageUrl: string }[]
): string | undefined {
  const terms = PRODUCT_MATCH_TERMS[productName];
  if (!terms) return undefined;

  for (const term of terms) {
    const normalized = term.toLowerCase();
    const match = storeProducts.find(
      (p) =>
        p.handle.toLowerCase().includes(normalized) ||
        p.title.toLowerCase().includes(normalized)
    );
    if (match) return match.imageUrl;
  }

  return undefined;
}

export default async function COALayout({ children }: { children: React.ReactNode }) {
  let storeProducts: { title: string; handle: string; imageUrl: string }[] = [];

  try {
    const products = await getProducts({ limit: 100 });
    storeProducts = products.map((p) => ({
      title: p.title,
      handle: p.handle,
      imageUrl: p.images.edges[0]?.node.url || '',
    }));
  } catch {
    // Swell unavailable — cards will render without product images
  }

  const hydratedBatches: Batch[] = COA_BATCHES.map((batch) => ({
    ...batch,
    imageUrl: matchProductImage(batch.product, storeProducts),
  }));

  return (
    <PageLayout>
      <COAProvider batches={hydratedBatches}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <COADesktopFilters className="col-span-3 max-md:hidden" />
          <COAMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            {children}
          </div>
        </div>
      </COAProvider>
    </PageLayout>
  );
}
