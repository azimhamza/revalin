import { HomeSidebar } from '@/components/layout/sidebar/home-sidebar';
import { PageLayout } from '@/components/layout/page-layout';
import { LatestProductCard } from '@/components/products/latest-product-card';
import { Badge } from '@/components/ui/badge';
import { getCollectionProducts, getCollections, getProduct, getProducts } from '@/lib/swell';
import { Product } from '../lib/swell/types';

const FEATURED_PRODUCT_HANDLE = 'retatrutide-glp1-triple-agonist';
const FEATURED_PRODUCT_KEYWORDS = ['retatrutide', 'glp-3rt'];
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
  const collections = await getCollections();

  let featuredProducts: Product[] = [];

  try {
    let featuredMatch: Product | null = null;

    if (collections.length > 0) {
      featuredProducts = await getCollectionProducts({ collection: collections[0].handle });
      featuredMatch = featuredProducts.find(isFeaturedProduct) || null;
    }

    // Pull from global catalog when collection results do not include Retatrutide.
    if (!featuredMatch || featuredProducts.length === 0) {
      const allProducts = await getProducts({ limit: 100 });
      const retatrutideMatches = await getProducts({ limit: 20, query: 'retatrutide' });

      featuredMatch =
        featuredMatch || retatrutideMatches.find(isFeaturedProduct) || allProducts.find(isFeaturedProduct) || null;

      featuredProducts = uniqueProducts([...featuredProducts, ...allProducts, ...retatrutideMatches]).slice(
        0,
        FEATURED_PRODUCTS_LIMIT * 2
      );
    } else {
      featuredProducts = uniqueProducts(featuredProducts).slice(0, FEATURED_PRODUCTS_LIMIT * 2);
    }

    if (!featuredMatch) {
      featuredMatch = await getProduct(FEATURED_PRODUCT_HANDLE);
    }

    featuredProducts = prioritizeFeaturedProduct(featuredProducts, featuredMatch).slice(0, FEATURED_PRODUCTS_LIMIT);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    featuredProducts = [];
  }

  const [lastProduct, ...restProducts] = featuredProducts;

  return (
    <PageLayout>
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
    </PageLayout>
  );
}
