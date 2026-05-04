import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { receivePurchaseOrder } from "@/lib/inventory-management/service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const receiveSchema = z.object({
  receivedAt: z.string().trim().optional().nullable(),
  proofUrls: z.array(z.string().trim()).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().trim().min(1),
        quantityReceived: z.coerce.number().int().min(0),
        notes: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/purchasing/purchase-orders/:id/receipts",
  access: "admin",
  paramsSchema,
  bodySchema: receiveSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    const receipt = await receivePurchaseOrder(params.id, {
      ...body,
      receivedByUserId: session.user.id,
    });

    return {
      data: {
        receipt,
      },
      status: 201,
    };
  },
});
