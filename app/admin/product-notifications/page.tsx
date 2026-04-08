import { getProductNotificationAdminData } from "@/lib/back-in-stock/service";
import { ProductNotificationManagement } from "./product-notification-management";

export const metadata = {
  title: "Restock Alerts | Revalin Admin",
};

type ProductNotificationsPageProps = {
  searchParams?: Promise<{
    q?: string | string[] | undefined;
  }>;
};

export default async function ProductNotificationsPage({
  searchParams,
}: ProductNotificationsPageProps) {
  const params = (await searchParams) || {};
  const query = Array.isArray(params.q) ? params.q[0] : params.q;
  const data = await getProductNotificationAdminData({
    query: query?.trim(),
  });

  return (
    <ProductNotificationManagement
      data={data}
      initialQuery={query?.trim() || ""}
    />
  );
}
