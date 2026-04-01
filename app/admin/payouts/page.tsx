import { getAllPayouts } from '@/lib/checkout/payout-service';
import { PayoutManagement } from './payout-management';

export const metadata = {
  title: 'Payout Management | Revalin Admin',
};

export default async function PayoutsPage() {
  const payouts = await getAllPayouts();

  const serialized = payouts.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    rejectedAt: p.rejectedAt?.toISOString() ?? null,
  }));

  return <PayoutManagement payouts={serialized} />;
}
