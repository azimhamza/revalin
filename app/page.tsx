import { HomeSidebar } from '@/components/layout/sidebar/home-sidebar';
import { PageLayout } from '@/components/layout/page-layout';
import { ValidationSection } from '@/components/home/validation-section';
import { LatestProductCard } from '@/components/products/latest-product-card';
import { MobileShopAllTile } from '@/components/home/mobile-shop-all-tile';
import { Badge } from '@/components/ui/badge';
import { getCollectionProducts, getCollections, getProduct, getProducts } from '@/lib/swell';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { Product } from '../lib/swell/types';
import { hasAnyVariantInStock } from '@/lib/inventory';

const FEATURED_PRODUCT_HANDLE = 'glp-3-triple-agonist';
const FEATURED_PRODUCT_KEYWORDS = ['glp-3', 'glp-3rt', 'triple-agonist'];
const FEATURED_PRODUCTS_LIMIT = 5;

function isFeaturedProduct(product: Product): boolean {
  const handle = (product.handle || '').toLowerCase();
  const title = (product.title || '').toLowerCase();

  if (handle === FEATURED_PRODUCT_HANDLE) return true;

  return FEATURED_PRODUCT_KEYWORDS.some(keyword => handle.includes(keyword) || title.includes(keyword));
}

function uniqueProducts(products: Product[]): Product[] {
  return products.filter(
    (product, index, self) => self.findIndex(candidate => candidate.id === product.id) === index
  );
}

function prioritizeFeaturedProduct(products: Product[], featuredProduct?: Product | null): Product[] {
  const featured = featuredProduct || products.find(isFeaturedProduct);
  if (!featured) return products;
  return [featured, ...products.filter(product => product.id !== featured.id)];
}

export default async function Home() {
  const currencyCode = await resolveRequestCurrencyCode();
  const collections = await getCollections();

  let featuredProducts: Product[] = [];

  try {
    // Fetch the full catalog so we can pick the best products to feature
    const allProducts = await getProducts({ limit: 100, currencyCode });
    const featuredSearchMatches = await getProducts({ limit: 20, query: 'glp-3', currencyCode });

    let featuredMatch: Product | null =
      featuredSearchMatches.find(isFeaturedProduct) || allProducts.find(isFeaturedProduct) || null;

    if (!featuredMatch) {
      featuredMatch = await getProduct(FEATURED_PRODUCT_HANDLE, currencyCode);
    }

    featuredProducts = uniqueProducts([...allProducts, ...featuredSearchMatches]).slice(
      0,
      FEATURED_PRODUCTS_LIMIT * 2
    );

    featuredProducts = prioritizeFeaturedProduct(featuredProducts, featuredMatch);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    featuredProducts = [];
  }

  // Hero stays as the featured product; sort the rest: in-stock first, then most purchased
  const [lastProduct, ...remaining] = featuredProducts;

  remaining.sort((a, b) => {
    const aHasStock = hasAnyVariantInStock(a) ? 0 : 1;
    const bHasStock = hasAnyVariantInStock(b) ? 0 : 1;
    if (aHasStock !== bHasStock) return aHasStock - bHasStock;
    return (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0);
  });
  const restProducts = remaining.slice(0, FEATURED_PRODUCTS_LIMIT - 1);

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Revalin',
    url: 'https://revalin.com',
    description:
      'Research peptide supplier offering independently tested, lab-grade compounds for in-vitro and pre-clinical research.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@revalin.ca',
      contactType: 'customer service',
    },
  };

  return (
    <PageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <div className="contents md:grid md:grid-cols-12 md:gap-sides">
        <HomeSidebar collections={collections} />
        <div className="flex relative flex-col grid-cols-2 col-span-8 w-full md:grid">
          <div className="fixed top-[28px] md:top-[30px] left-0 z-10 w-full pointer-events-none base-grid py-sides">
            <div className="col-span-8 col-start-5">
              <div className="hidden px-6 lg:block">
                <Badge variant="outline-secondary">latest drop</Badge>
              </div>
            </div>
          </div>
          {featuredProducts.length > 0 && (
            <>
              <LatestProductCard className="col-span-2" product={lastProduct} principal />

              <div className="relative z-20 md:hidden">
                <MobileShopAllTile />
              </div>

              {restProducts.map((product: any) => (
                <LatestProductCard
                  className="col-span-1"
                  key={product.id}
                  product={product}
                />
              ))}
            </>
          )}
        </div>
      </div>
      <ValidationSection />
    </PageLayout>
  );
}
