import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { AboutContent } from './components/about-content';

export const metadata: Metadata = {
  title: 'About Revalin | Proudly Canadian Research Chemicals',
  description:
    'Revalin is a proudly Canadian research chemical supplier. Independently tested by Janoshik Analytical, >99% average purity, same-day dispatch, open Certificates of Analysis.',
  keywords: [
    'Revalin',
    'research chemicals',
    'research chemical supplier Canada',
    'Janoshik Analytical',
    'Certificate of Analysis',
    'Canadian research chemicals',
    '99% purity research chemicals',
  ],
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About Revalin | Proudly Canadian Research Chemicals',
    description:
      'Why Revalin exists, who it is for, and what separates it from the rest of the research chemical market. Independently tested, openly documented, same-day dispatch.',
    url: '/about',
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <PageLayout>
      <AboutContent />
    </PageLayout>
  );
}
