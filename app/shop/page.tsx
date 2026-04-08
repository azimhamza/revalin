import { storeCatalog } from '@/lib/swell/constants';
import ProductList from './components/product-list';
import { Metadata } from 'next';
import { Suspense } from 'react';
import ResultsControls from './components/results-controls';
import { ProductGrid } from './components/product-grid';
import { ProductCardSkeleton } from './components/product-card-skeleton';

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
  alternates: {
    canonical: '/shop',
  },
};

// Enable ISR with 1 minute revalidation
export const revalidate = 60;

export default async function Shop(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  return (
    <>
      <Suspense
        fallback={
          <>
            <ResultsControls className="max-md:hidden" collections={[]} products={[]} />
            <ProductGrid>
              {Array.from({ length: 12 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </ProductGrid>
          </>
        }
      >
        <ProductList collection={storeCatalog.rootCategoryId} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
