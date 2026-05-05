import { createApiRoute } from "@/lib/api/route";
import { syncSwellProductsToInventory } from "@/lib/inventory-management/service";

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/inventory/sync-swell",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const result = await syncSwellProductsToInventory();

    return {
      data: result,
    };
  },
});
