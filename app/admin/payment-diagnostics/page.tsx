import { PaymentDiagnosticsPanel } from './_components/payment-diagnostics-panel';

export const metadata = {
  title: 'Payment Diagnostics | Revalin Admin',
};

type PaymentDiagnosticsPageProps = {
  searchParams?: Promise<{
    order?: string | string[] | undefined;
  }>;
};

export default async function PaymentDiagnosticsPage({
  searchParams,
}: PaymentDiagnosticsPageProps) {
  const params = (await searchParams) || {};
  const order = Array.isArray(params.order) ? params.order[0] : params.order;

  return <PaymentDiagnosticsPanel initialOrder={order || ''} />;
}
