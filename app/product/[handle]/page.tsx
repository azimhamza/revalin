import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getCollection, getLiveProduct, getProducts } from '@/lib/swell';
import { HIDDEN_PRODUCT_TAG } from '@/lib/constants';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { AddToCartButton } from '@/components/cart/add-to-cart';
import { ProductAddToCart } from './components/product-add-to-cart';
import { storeCatalog } from '@/lib/swell/constants';
import Prose from '@/components/prose';
import { formatPrice } from '@/lib/swell/utils';
import { Suspense } from 'react';
import { PageLayout } from '@/components/layout/page-layout';
import { VariantSelectorSlots } from './components/variant-selector-slots';
import { MobileGallerySlider } from './components/mobile-gallery-slider';
import { DesktopGallery } from './components/desktop-gallery';
import { TestResultsTrigger } from '@/components/products/test-results-panel';
import { getBatchesForProduct } from '@/lib/coa-data';
import { BulkPricing } from './components/bulk-pricing';
import { ProductPrice } from './components/product-price';
import { RelatedProducts } from './components/related-products';
import { ProductQuantityProvider } from './components/product-quantity-context';
import { ProductInventoryPanel } from './components/product-inventory-panel';
import { ProductViewTracker } from './components/product-view-tracker';
import { getInventoryState } from '@/lib/inventory';

// Generate static params for all products at build time
export async function generateStaticParams() {
  try {
    const products = await getProducts({ limit: 100 }); // Get first 100 products

    return products.map(product => ({
      handle: product.handle,
    }));
  } catch (error) {
    console.error('Error generating static params for products:', error);
    return [];
  }
}

export async function generateMetadata(props: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const params = await props.params;
  const product = await getLiveProduct(params.handle);

  if (!product) return notFound();

  const { url, width, height, altText: alt } = product.featuredImage || {};
  const indexable = !product.tags.includes(HIDDEN_PRODUCT_TAG);

  return {
    title: product.seo.title || product.title,
    description: product.seo.description || product.description,
    alternates: {
      canonical: `/product/${params.handle}`,
    },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
    },
    openGraph: url
      ? {
          images: [
            {
              url,
              width,
              height,
              alt,
            },
          ],
        }
      : null,
  };
}

export default async function ProductPage(props: { params: Promise<{ handle: string }> }) {
  const currencyCode = await resolveRequestCurrencyCode();
  const params = await props.params;
  const product = await getLiveProduct(params.handle, currencyCode);

  if (!product) return notFound();

  const collection = product.categoryId ? await getCollection(product.categoryId) : null;
  const productBatches = getBatchesForProduct(product.handle, product.title);
  const inventory = getInventoryState(product);

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.featuredImage.url,
    offers: {
      '@type': 'AggregateOffer',
      availability: inventory.isBackorder ? 'https://schema.org/BackOrder' : 'https://schema.org/InStock',
      priceCurrency: product.currencyCode,
      highPrice: product.priceRange.maxVariantPrice.amount,
      lowPrice: product.priceRange.minVariantPrice.amount,
    },
  };

  const [rootParentCategory] = collection?.parentCategoryTree.filter(
    (c: any) => c.id !== storeCatalog.rootCategoryId
  ) ?? [undefined];

  return (
    <PageLayout className="bg-muted">
      <ProductViewTracker
        handle={product.handle}
        title={product.title}
        price={product.priceRange.minVariantPrice.amount}
        currencyCode={product.currencyCode}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
      />

      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-sides min-h-max">
        {/* Mobile Gallery Slider */}
        <div className="md:hidden col-span-full h-[60vh] min-h-[400px]">
          <Suspense fallback={null}>
            <MobileGallerySlider product={product} />
          </Suspense>
        </div>

        <div className="flex sticky top-0 flex-col col-span-5 2xl:col-span-4 max-md:col-span-full md:h-screen min-h-max max-md:p-sides md:pl-sides md:pt-top-spacing max-md:static">
          <div className="col-span-full">
            <Breadcrumb className="col-span-full mb-4 md:mb-8">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/shop" prefetch>
                      Shop
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {rootParentCategory && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href={`/shop/${rootParentCategory.id}`} prefetch>
                          {rootParentCategory.name}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </>
                )}
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{product.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <ProductQuantityProvider>
              <div className="flex flex-col col-span-full gap-4 md:mb-10 max-md:order-2">
                <div className="flex flex-col gap-4 px-5 py-5 rounded-2xl bg-popover md:gap-4 md:px-3 md:py-2 md:rounded-md">
                  <h1 className="text-2xl leading-[1.1] font-bold md:text-lg lg:text-xl 2xl:text-2xl text-balance">
                    {product.title}
                  </h1>
                  <Suspense
                    fallback={
                      <p className="flex min-w-0 gap-3 items-center text-2xl leading-none font-bold md:text-lg lg:text-xl 2xl:text-2xl">
                        {formatPrice(
                          product.priceRange.minVariantPrice.amount,
                          product.priceRange.minVariantPrice.currencyCode
                        )}
                        {product.compareAtPrice && (
                          <span className="text-xl line-through opacity-30 md:text-base">
                            {formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currencyCode)}
                          </span>
                        )}
                      </p>
                    }
                  >
                    <ProductPrice product={product} />
                  </Suspense>
                </div>
                <div className="grid grid-cols-1 gap-4 md:items-start">
                  <Suspense fallback={<VariantSelectorSlots product={product} fallback />}>
                    <VariantSelectorSlots product={product} />
                  </Suspense>

                  <Suspense fallback={null}>
                    <ProductInventoryPanel product={product} />
                  </Suspense>

                  <Suspense
                    fallback={<AddToCartButton className="hidden md:block md:w-full md:self-start" product={product} size="lg" />}
                  >
                    <ProductAddToCart product={product} className="hidden md:block md:w-full md:self-start" />
                  </Suspense>
                </div>
                <Suspense
                  fallback={
                    <AddToCartButton
                      className="md:hidden w-full"
                      product={product}
                      size="lg"
                      style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                    />
                  }
                >
                  <ProductAddToCart
                    product={product}
                    className="md:hidden w-full"
                    style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                  />
                </Suspense>

                {productBatches.length > 0 && (
                  <TestResultsTrigger batches={productBatches} />
                )}
                <Suspense fallback={null}>
                  <BulkPricing product={product} />
                </Suspense>
              </div>
            </ProductQuantityProvider>
          </div>

          <Prose
            className="col-span-full mb-auto opacity-70 max-md:order-3 max-md:my-6 max-md:px-2"
            html={product.descriptionHtml}
          />

        </div>

        {/* Desktop Gallery */}
        <div className="hidden overflow-y-auto relative col-span-7 col-start-6 w-full md:block">
          <Suspense fallback={null}>
            <DesktopGallery product={product} />
          </Suspense>
          <Suspense fallback={null}>
            <RelatedProducts product={product} currencyCode={currencyCode} />
          </Suspense>
        </div>
      </div>

      {/* Mobile related products */}
      <Suspense fallback={null}>
        <RelatedProducts product={product} currencyCode={currencyCode} className="px-sides py-10 md:hidden" />
      </Suspense>
    </PageLayout>
  );
}
