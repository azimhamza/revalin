import { PageLayout } from '@/components/layout/page-layout';
import { ResearchProvider, Peptide } from './providers/research-provider';
import { ResearchDesktopFilters } from './components/research-filters';
import { ResearchMobileFilters } from './components/research-mobile-filters';
import { ResearchListContent } from './components/research-list-content';

export const metadata = {
  title: 'Research Library - Peptide Profiles & Protocols',
  description:
    'Comprehensive research peptide profiles with storage protocols, reconstitution guidelines, and study references.',
};

// Mock data - replace with actual database/CMS
const peptides: Peptide[] = [
  {
    id: '1',
    slug: 'bpc-157',
    name: 'BPC-157',
    sequence: 'Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val',
    description:
      'A pentadecapeptide derived from body protection compound, studied for its potential in tissue repair and healing research.',
    tags: ['Healing', 'Recovery', 'Tissue Repair'],
  },
  {
    id: '2',
    slug: 'tb-500',
    name: 'TB-500',
    sequence: 'Ac-Ser-Asp-Lys-Pro-Asp-Met-Ala-Glu-Ile-Glu-Lys...',
    description:
      'A synthetic peptide fragment of Thymosin Beta-4, researched for cellular migration and differentiation studies.',
    tags: ['Recovery', 'Cellular', 'Migration'],
  },
  {
    id: '3',
    slug: 'ghk-cu',
    name: 'GHK-Cu',
    sequence: 'Gly-His-Lys',
    description:
      'A copper-binding tripeptide naturally present in human plasma, studied for its role in wound healing and tissue remodeling.',
    tags: ['Copper', 'Healing', 'Remodeling'],
  },
  {
    id: '4',
    slug: 'cjc-1295',
    name: 'CJC-1295',
    sequence: 'Tyr-D-Ala-Asp-Ala-Ile-Phe-Thr-Gln-Ser-Tyr-Arg-Lys...',
    description:
      'A growth hormone-releasing hormone analog studied for its extended half-life and sustained release properties.',
    tags: ['GHRH', 'Growth Factor', 'Analog'],
  },
  {
    id: '5',
    slug: 'ipamorelin',
    name: 'Ipamorelin',
    sequence: 'Aib-His-D-2-Nal-D-Phe-Lys-NH2',
    description:
      'A selective growth hormone secretagogue receptor agonist researched for its specificity and minimal side effects.',
    tags: ['GHSR', 'Selective', 'Secretagogue'],
  },
  {
    id: '6',
    slug: 'selank',
    name: 'Selank',
    sequence: 'Thr-Lys-Pro-Arg-Pro-Gly-Pro',
    description:
      'A synthetic analog of tuftsin with anxiolytic properties, studied for its cognitive and neuroprotective effects.',
    tags: ['Cognitive', 'Neuroprotective', 'Anxiolytic'],
  },
];

export default function ResearchPage() {
  return (
    <PageLayout>
      <ResearchProvider peptides={peptides}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <ResearchDesktopFilters className="col-span-3 max-md:hidden" />
          <ResearchMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            <ResearchListContent />
          </div>
        </div>
      </ResearchProvider>
    </PageLayout>
  );
}
