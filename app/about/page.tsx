import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { AboutContent } from './components/about-content';

export const metadata: Metadata = {
  title: 'About Revalin | Proudly Canadian Research Peptides',
  description:
    'Revalin is a proudly Canadian research peptide supplier. Independently tested by Janoshik Analytical, >99% average purity, same-day dispatch, open Certificates of Analysis.',
  keywords: [
    'Revalin',
    'research peptides',
    'peptide supplier Canada',
    'Janoshik Analytical',
    'Certificate of Analysis',
    'Canadian peptides',
    '99% purity peptides',
  ],
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About Revalin | Proudly Canadian Research Peptides',
    description:
      'Why Revalin exists, who it is for, and what separates it from the rest of the peptide market. Independently tested, openly documented, same-day dispatch.',
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
