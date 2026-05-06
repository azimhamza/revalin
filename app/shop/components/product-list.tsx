import { use } from 'react';
import { getCollectionProducts, getCollections, getProducts } from '@/lib/swell';
import type { Product, ProductCollectionSortKey, ProductSortKey } from '@/lib/swell/types';
import { ProductListContent } from './product-list-content';
import { mapSortKeys } from '@/lib/swell/utils';
import { storeCatalog } from '@/lib/swell/constants';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import { getProductPurchaseMetricsByHandle, sortProductsForMerchandising } from '@/lib/product-ordering';

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
        live: true,
      });
    } else {
      products = await getCollectionProducts({
        collection,
        limit: SHOP_FETCH_LIMIT,
        query,
        sortKey: sortKey as ProductCollectionSortKey,
        reverse,
        currencyCode,
        live: true,
      });
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    products = [];
  }

  const purchaseMetricsByHandle = await getProductPurchaseMetricsByHandle();
  products = sortProductsForMerchandising(products, purchaseMetricsByHandle);

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
