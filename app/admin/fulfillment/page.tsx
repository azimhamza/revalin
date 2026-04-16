import { listFulfillmentOrders } from '@/lib/checkout/fulfillment-service';
import { FulfillmentTable } from './_components/fulfillment-table';

export const metadata = {
  title: 'Fulfillment | Revalin Admin',
};

const isDev = process.env.NODE_ENV === 'development';

type FulfillmentPageProps = {
  searchParams?: Promise<{
    status?: string | string[] | undefined;
  }>;
};

export default async function FulfillmentPage({
  searchParams,
}: FulfillmentPageProps) {
  const params = (await searchParams) || {};
  const statusParam = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const validStatuses = [
    'label_ready',
    'packed',
    'handed_to_carrier',
    'error',
    'all',
    ...(isDev ? ['pending'] as const : []),
  ];
  const status =
    validStatuses.find((s) => s === statusParam) || 'label_ready';

  const result = await listFulfillmentOrders({
    status: status as Parameters<typeof listFulfillmentOrders>[0]['status'],
    page: 1,
    pageSize: 100,
  });

  return (
    <FulfillmentTable
      initialOrders={result.data}
      initialTotal={result.total}
      initialStatus={status as 'label_ready'}
      isDev={isDev}
    />
  );
}
