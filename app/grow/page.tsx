import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { GrowContent } from './components/grow-content';

export const metadata: Metadata = {
  title: 'Grow | Revalin',
  description:
    'Two ways to grow with Revalin. Become a Growth Partner and earn up to 45% commission on every referred sale, or join as a Promoter and build a network of partners.',
  keywords: [
    'Revalin',
    'partner program',
    'research peptides',
    'growth partner',
    'promoter',
    'earn commission',
    'research community',
    'peptide partner',
  ],
  alternates: {
    canonical: '/grow',
  },
  openGraph: {
    title: 'Grow | Revalin',
    description:
      'Two ways to grow with Revalin. Earn up to 45% commission as a Growth Partner or build a network as a Promoter.',
    url: '/grow',
    type: 'website',
  },
};

export default function GrowPage() {
  return (
    <PageLayout>
      <GrowContent />
    </PageLayout>
  );
}
