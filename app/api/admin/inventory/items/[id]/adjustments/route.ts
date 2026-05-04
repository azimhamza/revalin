import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { createManualInventoryAdjustment } from "@/lib/inventory-management/service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const adjustmentSchema = z.object({
  quantityDelta: z.coerce.number().int(),
  notes: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/inventory/items/:id/adjustments",
  access: "admin",
  paramsSchema,
  bodySchema: adjustmentSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    const movement = await createManualInventoryAdjustment({
      itemId: params.id,
      quantityDelta: body.quantityDelta,
      notes: body.notes,
      createdByUserId: session.user.id,
    });

    return {
      data: {
        movement,
      },
      status: 201,
    };
  },
});
