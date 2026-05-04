import {
  getInventoryDashboard,
  type InventoryItemType,
  type InventoryStockStatus,
} from "@/lib/inventory-management/service";

import { InventoryManagement } from "./inventory-management";

export const metadata = {
  title: "Inventory | Revalin Admin",
};

type InventoryPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    categoryId?: string | string[];
    itemType?: string | string[];
    stockStatus?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = (await searchParams) || {};
  const itemType = firstParam(params.itemType);
  const stockStatus = firstParam(params.stockStatus);

  const data = await getInventoryDashboard({
    query: firstParam(params.q),
    categoryId: firstParam(params.categoryId),
    itemType: (itemType || "all") as InventoryItemType | "all",
    stockStatus: (stockStatus || "all") as InventoryStockStatus | "all",
  });

  return (
    <InventoryManagement
      data={data}
      initialFilters={{
        q: firstParam(params.q) || "",
        categoryId: firstParam(params.categoryId) || "all",
        itemType: itemType || "all",
        stockStatus: stockStatus || "all",
      }}
    />
  );
}
