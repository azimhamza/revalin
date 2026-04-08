import { notFound } from 'next/navigation';
import { PageLayout } from '@/components/layout/page-layout';
import { PeptideProvider, PeptideData, Article } from './providers/peptide-provider';
import { PeptideDesktopFilters } from './components/peptide-filters';
import { PeptideMobileFilters } from './components/peptide-mobile-filters';
import { ArticleListContent } from './components/article-list-content';

interface PeptideEntry {
  peptide: PeptideData;
  articles: Article[];
}

// Mock data - replace with actual database/CMS
const peptidesData: Record<string, PeptideEntry> = {
  'bpc-157': {
    peptide: {
      name: 'BPC-157',
      fullName: 'Body Protection Compound 157',
      slug: 'bpc-157',
      sequence: 'Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val',
      description:
        'BPC-157 is a pentadecapeptide composed of 15 amino acids. It is a partial sequence of body protection compound (BPC) discovered in and isolated from human gastric juice.',
      molecularWeight: '1419.53 g/mol',
      cas: '137525-51-0',
      productSlug: 'bpc-157',
    },
    articles: [
      {
        id: 'bpc-ibd',
        title: 'BPC-157 in Inflammatory Bowel Disease Trials',
        excerpt:
          'An overview of clinical research exploring the stable gastric pentadecapeptide BPC 157 in the context of inflammatory bowel disease, including mechanisms of action and observed outcomes.',
        topic: 'Gastrointestinal',
        date: 'Jan 2024',
        readTime: '8 min read',
        content: '',
        studies: [
          {
            title: 'Stable gastric pentadecapeptide BPC 157 in trials for inflammatory bowel disease',
            authors: 'Seiwerth S, et al.',
            year: '2018',
            pmid: '29469625',
            url: 'https://pubmed.ncbi.nlm.nih.gov/29469625/',
          },
        ],
      },
      {
        id: 'bpc-vessels',
        title: 'BPC-157 and Blood Vessel Formation',
        excerpt:
          'Research into BPC-157\'s role in angiogenesis and blood vessel repair, examining its effects on endothelial cell migration and vascular growth factor expression.',
        topic: 'Angiogenesis',
        date: 'Dec 2023',
        readTime: '6 min read',
        content: '',
        studies: [
          {
            title: 'BPC 157 and blood vessels',
            authors: 'Sikiric P, et al.',
            year: '2008',
            pmid: '18386906',
            url: 'https://pubmed.ncbi.nlm.nih.gov/18386906/',
          },
        ],
      },
      {
        id: 'bpc-tendon',
        title: 'Tendon Healing Mechanisms of BPC-157',
        excerpt:
          'A review of studies investigating BPC-157\'s potential to accelerate tendon-to-bone healing, including collagen fiber organization and growth factor modulation.',
        topic: 'Tissue Repair',
        date: 'Nov 2023',
        readTime: '7 min read',
        content: '',
        studies: [],
      },
      {
        id: 'bpc-neuro',
        title: 'Neuroprotective Properties of BPC-157',
        excerpt:
          'Exploring the research on BPC-157\'s interactions with the dopaminergic and serotonergic systems, and its potential neuroprotective applications.',
        topic: 'Neuroprotection',
        date: 'Oct 2023',
        readTime: '10 min read',
        content: '',
        studies: [],
      },
      {
        id: 'bpc-storage',
        title: 'Storage & Reconstitution Protocol for BPC-157',
        excerpt:
          'Best practices for storing lyophilized BPC-157 at -20°C, reconstitution with bacteriostatic water, and maintaining peptide stability over time.',
        topic: 'Protocols',
        date: 'Sep 2023',
        readTime: '4 min read',
        content: '',
        studies: [],
      },
      {
        id: 'bpc-gi',
        title: 'Gastric Cytoprotection Research with BPC-157',
        excerpt:
          'Examining BPC-157\'s cytoprotective effects on gastric mucosa, including protection against ethanol- and NSAID-induced lesions in research models.',
        topic: 'Gastrointestinal',
        date: 'Aug 2023',
        readTime: '9 min read',
        content: '',
        studies: [],
      },
    ],
  },
  'tb-500': {
    peptide: {
      name: 'TB-500',
      fullName: 'Thymosin Beta-4 Fragment',
      slug: 'tb-500',
      sequence: 'Ac-Ser-Asp-Lys-Pro-Asp-Met-Ala-Glu-Ile-Glu-Lys-Phe-Asp-Lys-Ser-Lys-Leu-Lys-Lys-Thr-Glu-Thr',
      description:
        'TB-500 is a synthetic peptide version of the naturally occurring peptide Thymosin Beta-4. It is a highly conserved 43-amino acid peptide present in virtually all mammalian cells.',
      molecularWeight: '4963.44 g/mol',
      cas: '77591-33-4',
      productSlug: 'tb-500',
    },
    articles: [
      {
        id: 'tb-regen',
        title: 'Thymosin Beta-4: A Multi-Functional Regenerative Peptide',
        excerpt:
          'A comprehensive review of Thymosin Beta-4\'s role in regenerative biology, covering wound healing, anti-inflammatory properties, and stem cell differentiation.',
        topic: 'Regeneration',
        date: 'Feb 2024',
        readTime: '12 min read',
        content: '',
        studies: [
          {
            title: 'Thymosin β4: a multi-functional regenerative peptide',
            authors: 'Goldstein AL, et al.',
            year: '2012',
            pmid: '22357552',
            url: 'https://pubmed.ncbi.nlm.nih.gov/22357552/',
          },
        ],
      },
      {
        id: 'tb-dermal',
        title: 'Dermal Healing and TB-500',
        excerpt:
          'Research into how Thymosin Beta-4 promotes dermal wound healing through keratinocyte migration, collagen deposition, and angiogenesis.',
        topic: 'Wound Healing',
        date: 'Jan 2024',
        readTime: '7 min read',
        content: '',
        studies: [
          {
            title: 'Thymosin beta4 promotes dermal healing',
            authors: 'Philp D, et al.',
            year: '2003',
            pmid: '12692256',
            url: 'https://pubmed.ncbi.nlm.nih.gov/12692256/',
          },
        ],
      },
      {
        id: 'tb-actin',
        title: 'Actin Polymerization and Cell Migration',
        excerpt:
          'How TB-500 regulates actin polymerization to promote cellular migration, a key mechanism underlying its tissue repair capabilities.',
        topic: 'Cell Biology',
        date: 'Dec 2023',
        readTime: '8 min read',
        content: '',
        studies: [],
      },
      {
        id: 'tb-cardiac',
        title: 'Cardiac Repair Research with Thymosin Beta-4',
        excerpt:
          'Investigating TB-500\'s potential in cardiac tissue repair, including cardiomyocyte survival, reduction of scar tissue, and improvement of cardiac function in research models.',
        topic: 'Regeneration',
        date: 'Nov 2023',
        readTime: '11 min read',
        content: '',
        studies: [],
      },
      {
        id: 'tb-protocol',
        title: 'TB-500 Reconstitution & Handling Guide',
        excerpt:
          'Standard protocols for reconstituting TB-500, proper storage conditions, and best practices for maintaining peptide integrity in laboratory settings.',
        topic: 'Protocols',
        date: 'Oct 2023',
        readTime: '3 min read',
        content: '',
        studies: [],
      },
    ],
  },
};

export async function generateStaticParams() {
  return Object.keys(peptidesData).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = peptidesData[slug];
  if (!entry) return {};
  return {
    title: `${entry.peptide.name} Research - Peptide Studies & Protocols`,
    description: entry.peptide.description,
    alternates: {
      canonical: `/research/${slug}`,
    },
  };
}

export default async function PeptidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = peptidesData[slug];

  if (!entry) {
    notFound();
  }

  return (
    <PageLayout>
      <PeptideProvider peptide={entry.peptide} articles={entry.articles}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <PeptideDesktopFilters className="col-span-3 max-md:hidden" />
          <PeptideMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            <ArticleListContent />
          </div>
        </div>
      </PeptideProvider>
    </PageLayout>
  );
}
