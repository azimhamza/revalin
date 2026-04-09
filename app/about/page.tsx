import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/page-layout';
import { AboutContent } from './components/about-content';

export const metadata: Metadata = {
  title: 'About Revalin | Research Peptides from Waterloo, Canada',
  description:
    'Revalin is a Canadian research peptide supplier based in Waterloo, Ontario. Independently tested by Janoshik Analytical, >99% average purity, same-day dispatch, open Certificates of Analysis.',
  keywords: [
    'Revalin',
    'research peptides',
    'peptide supplier Canada',
    'Janoshik Analytical',
    'Certificate of Analysis',
    'Waterloo peptides',
    '99% purity peptides',
  ],
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About Revalin | Research Peptides from Waterloo, Canada',
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
