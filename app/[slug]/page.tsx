import { notFound } from 'next/navigation';
import { RESERVED_SLUGS } from '@/lib/checkout/affiliate-constants';
import { getAffiliateByCode } from '@/lib/checkout/affiliate-service';
import { AffiliateRedirect } from './affiliate-redirect';

export const metadata = {
  title: 'Affiliate Redirect | Revalin',
  description: 'Redirecting to the Revalin storefront with affiliate attribution applied.',
  robots: {
    index: false,
    follow: false,
  },
};

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function AffiliateSlugPage({ params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase();

  if (RESERVED_SLUGS.has(normalizedSlug)) {
    notFound();
  }

  const affiliate = await getAffiliateByCode(normalizedSlug);

  if (!affiliate || affiliate.status !== 'approved') {
    notFound();
  }

  return <AffiliateRedirect code={affiliate.code} discountCode={affiliate.discountCode} />;
}
