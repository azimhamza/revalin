import {
  getPurchasingDashboard,
  type PurchaseOrderStatus,
  type PurchasePaymentStatus,
} from "@/lib/inventory-management/service";

import { PurchasingManagement } from "./purchasing-management";

export const metadata = {
  title: "Purchasing | Revalin Admin",
};

type PurchasingPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    status?: string | string[];
    paymentStatus?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PurchasingPage({
  searchParams,
}: PurchasingPageProps) {
  const params = (await searchParams) || {};
  const status = firstParam(params.status) || "all";
  const paymentStatus = firstParam(params.paymentStatus) || "all";
  const data = await getPurchasingDashboard({
    query: firstParam(params.q),
    status: status as PurchaseOrderStatus | "all",
    paymentStatus: paymentStatus as PurchasePaymentStatus | "all",
  });

  return (
    <PurchasingManagement
      data={data}
      initialFilters={{
        q: firstParam(params.q) || "",
        status,
        paymentStatus,
      }}
    />
  );
}
