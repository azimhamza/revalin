import { listFulfillmentOrders } from '@/lib/checkout/fulfillment-service';
import { getShippoConfigStatus } from '@/lib/checkout/shippo';
import { getShippoFulfillmentSettings } from '@/lib/checkout/shippo-fulfillment-settings';
import { FulfillmentTable, type FulfillmentTabKey } from './_components/fulfillment-table';

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
    'not_required',
    'all',
    'pending',
  ];
  const status =
    validStatuses.find((s) => s === statusParam) || 'all';

  const [result, shippoSettings] = await Promise.all([
    listFulfillmentOrders({
      status: status as Parameters<typeof listFulfillmentOrders>[0]['status'],
      page: 1,
      pageSize: 100,
    }),
    getShippoFulfillmentSettings(),
  ]);

  return (
    <FulfillmentTable
      initialOrders={result.data}
      initialTotal={result.total}
      initialStatus={status as FulfillmentTabKey}
      isDev={isDev}
      initialShippoSettings={shippoSettings}
      shippoConfig={getShippoConfigStatus()}
    />
  );
}
