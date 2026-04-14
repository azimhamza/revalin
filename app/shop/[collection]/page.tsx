import { Metadata } from 'next';
import { getCollection } from '@/lib/swell';
import { notFound } from 'next/navigation';
import ProductList from '../components/product-list';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ collection: string }> }): Promise<Metadata> {
  const params = await props.params;
  const collection = await getCollection(params.collection);

  if (!collection) return notFound();

  return {
    title: `Revalin | ${collection.seo?.title || collection.title}`,
    description:
      collection.seo?.description ||
      collection.description ||
      `${collection.title} research peptide products available for qualified purchase through Revalin.`,
    keywords: [
      `${collection.title} peptides`,
      `${collection.title} peptide purchase`,
      'research peptides',
      'peptide distributor',
      'research product supplier',
      'laboratory peptides',
    ],
    alternates: {
      canonical: `/shop/${params.collection}`,
    },
  };
}

export default async function ShopCategory(props: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  return <ProductList collection={params.collection} searchParams={searchParams} />;
}
