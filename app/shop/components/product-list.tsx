import { use } from 'react';
import { getCollectionProducts, getCollections, getProducts } from '@/lib/swell';
import type { Product, ProductCollectionSortKey, ProductSortKey } from '@/lib/swell/types';
import { ProductListContent } from './product-list-content';
import { mapSortKeys } from '@/lib/swell/utils';
import { storeCatalog } from '@/lib/swell/constants';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { hasAnyVariantInStock } from '@/lib/inventory';

interface ProductListProps {
  collection: string;
  searchParams?: { [key: string]: string | string[] | undefined };
}

// Swell product listing is paginated. Request a large catalog window so client-side
// filtering operates on the full product set rather than a partial first page.
const SHOP_FETCH_LIMIT = 1000;

async function getProductListData({
  collection,
  searchParams,
}: ProductListProps) {
  const currencyCode = await resolveRequestCurrencyCode();
  const query = typeof searchParams?.q === 'string' ? searchParams.q : undefined;
  const sort = typeof searchParams?.sort === 'string' ? searchParams.sort : undefined;
  const isRootCollection = collection === storeCatalog.rootCategoryId || !collection;

  const { sortKey, reverse } = isRootCollection ? mapSortKeys(sort, 'product') : mapSortKeys(sort, 'collection');

  let products: Product[] = [];

  try {
    if (isRootCollection) {
      products = await getProducts({
        limit: SHOP_FETCH_LIMIT,
        sortKey: sortKey as ProductSortKey,
        query,
        reverse,
        currencyCode,
      });
    } else {
      products = await getCollectionProducts({
        collection,
        limit: SHOP_FETCH_LIMIT,
        query,
        sortKey: sortKey as ProductCollectionSortKey,
        reverse,
        currencyCode,
      });
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    products = [];
  }

  // Sort: products with any in-stock variant first, then most purchased, then Swell order
  products.sort((a, b) => {
    const aHasStock = hasAnyVariantInStock(a) ? 0 : 1;
    const bHasStock = hasAnyVariantInStock(b) ? 0 : 1;
    if (aHasStock !== bHasStock) return aHasStock - bHasStock;
    return (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0);
  });

  const collections = await getCollections();

  return {
    products,
    collections,
  };
}

export default function ProductList({ collection, searchParams }: ProductListProps) {
  const { products, collections } = use(
    getProductListData({ collection, searchParams })
  );

  return <ProductListContent products={products} collections={collections} />;
}
