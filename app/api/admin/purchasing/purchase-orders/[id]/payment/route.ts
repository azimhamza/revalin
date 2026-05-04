import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { updatePurchaseOrderPayment } from "@/lib/inventory-management/service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const paymentSchema = z.object({
  paymentStatus: z.enum(["unpaid", "partially_paid", "paid", "refunded", "void"]),
  amountPaid: z.union([z.string(), z.number()]).optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),
  paymentReference: z.string().trim().optional().nullable(),
  proofUrls: z.array(z.string().trim()).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export const PATCH = createApiRoute({
  route: "/api/admin/purchasing/purchase-orders/:id/payment",
  access: "admin",
  paramsSchema,
  bodySchema: paymentSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    const purchaseOrder = await updatePurchaseOrderPayment(params.id, body);

    return {
      data: {
        purchaseOrder,
      },
    };
  },
});
