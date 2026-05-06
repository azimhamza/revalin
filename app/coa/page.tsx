import { COAListContent } from './components/coa-list-content';

export const metadata = {
  title: 'Certificates of Analysis - COAs',
  description:
    'View certificates of analysis for all research chemical batches. Every batch tested by independent third-party laboratories.',
  alternates: {
    canonical: '/coa',
  },
};

export default function COAPage() {
  return <COAListContent />;
}
