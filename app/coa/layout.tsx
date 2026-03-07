import { PageLayout } from '@/components/layout/page-layout';
import { COAProvider, Batch } from './providers/coa-provider';
import { COADesktopFilters } from './components/coa-filters';
import { COAMobileFilters } from './components/coa-mobile-filters';

// Mock data - replace with actual database query
const batches: Batch[] = [
  {
    id: '1',
    product: 'BPC-157',
    size: '5mg',
    number: 'BPC-2024-Q1-127',
    date: 'Jan 15, 2024',
    purity: '99.4',
    identity: 'Confirmed',
    endotoxin: '<0.5 EU/mg',
    sterility: 'Pass',
    pdfUrl: '#',
  },
  {
    id: '2',
    product: 'BPC-157',
    size: '10mg',
    number: 'BPC-2024-Q1-142',
    date: 'Feb 3, 2024',
    purity: '99.6',
    identity: 'Confirmed',
    endotoxin: '<0.3 EU/mg',
    sterility: 'Pass',
    pdfUrl: '#',
  },
  {
    id: '3',
    product: 'TB-500',
    size: '5mg',
    number: 'TB5-2024-Q1-089',
    date: 'Jan 28, 2024',
    purity: '99.2',
    identity: 'Confirmed',
    endotoxin: '<0.4 EU/mg',
    sterility: 'Pass',
    pdfUrl: '#',
  },
  {
    id: '4',
    product: 'GHK-Cu',
    size: '50mg',
    number: 'GHK-2024-Q1-156',
    date: 'Feb 12, 2024',
    purity: '99.8',
    identity: 'Confirmed',
    endotoxin: '<0.2 EU/mg',
    sterility: 'Pass',
    pdfUrl: '#',
  },
];

export default function COALayout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout>
      <COAProvider batches={batches}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <COADesktopFilters className="col-span-3 max-md:hidden" />
          <COAMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            {children}
          </div>
        </div>
      </COAProvider>
    </PageLayout>
  );
}
