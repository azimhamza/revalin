import { listInteracReviews } from '@/lib/checkout/interac';
import { InteracReviewManagement } from './review-management';

export const metadata = {
  title: 'Interac Reviews | Revalin Admin',
};

type InteracPageProps = {
  searchParams?: Promise<{
    status?: string | string[] | undefined;
  }>;
};

export default async function InteracPage({ searchParams }: InteracPageProps) {
  const params = (await searchParams) || {};
  const statusParam = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = statusParam || 'open';
  const result = await listInteracReviews({
    status,
    page: 1,
    pageSize: 100,
  });

  return (
    <InteracReviewManagement
      initialReviews={result.data}
      initialTotal={result.total}
      initialStatus={status}
    />
  );
}
