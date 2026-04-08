import type { MetadataRoute } from 'next';

import { getCollections, getProducts } from '@/lib/swell';
import { HIDDEN_PRODUCT_TAG } from '@/lib/constants';

const SITE_URL = 'https://revalin.com';

// Research slugs with actual detail pages (see app/research/[slug]/page.tsx peptidesData).
const RESEARCH_SLUGS = ['bpc-157', 'tb-500'];

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/shop', changeFrequency: 'daily', priority: 0.9 },
  { path: '/research', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/coa', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/shipping', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms-of-service', changeFrequency: 'yearly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(route => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const researchEntries: MetadataRoute.Sitemap = RESEARCH_SLUGS.map(slug => ({
    url: `${SITE_URL}/research/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  let collectionEntries: MetadataRoute.Sitemap = [];
  try {
    const collections = await getCollections();
    collectionEntries = collections
      .filter(collection => Boolean(collection?.handle))
      .map(collection => ({
        url: `${SITE_URL}/shop/${collection.handle}`,
        lastModified: collection.updatedAt ? new Date(collection.updatedAt) : now,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.error('Sitemap: failed to load collections', error);
  }

  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await getProducts({ limit: 250 });
    productEntries = products
      .filter(product => Boolean(product?.handle) && !product.tags?.includes(HIDDEN_PRODUCT_TAG))
      .map(product => ({
        url: `${SITE_URL}/product/${product.handle}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.error('Sitemap: failed to load products', error);
  }

  return [...staticEntries, ...collectionEntries, ...productEntries, ...researchEntries];
}
