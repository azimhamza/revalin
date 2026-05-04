import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import {
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/lib/inventory-management/service";

const paymentStatusSchema = z.enum([
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
  "void",
]);

const orderStatusSchema = z.enum([
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

const querySchema = z.object({
  q: z.string().trim().optional(),
  status: z.union([orderStatusSchema, z.literal("all")]).optional(),
  paymentStatus: z.union([paymentStatusSchema, z.literal("all")]).optional(),
});

const createPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().optional().nullable(),
  vendorId: z.string().trim().optional().nullable(),
  currencyCode: z.string().trim().optional().nullable(),
  paymentStatus: paymentStatusSchema.optional().nullable(),
  paymentMethod: z.string().trim().optional().nullable(),
  paymentReference: z.string().trim().optional().nullable(),
  amountPaid: z.union([z.string(), z.number()]).optional().nullable(),
  proofUrls: z.array(z.string().trim()).optional().nullable(),
  expectedAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        quantityOrdered: z.coerce.number().int().min(1),
        unitCost: z.union([z.string(), z.number()]).optional().nullable(),
        notes: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/purchasing/purchase-orders",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const purchaseOrders = await listPurchaseOrders({
      query: query.q,
      status: query.status,
      paymentStatus: query.paymentStatus,
    });

    return {
      data: purchaseOrders,
      page: 1,
      pageSize: purchaseOrders.length,
      total: purchaseOrders.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/purchasing/purchase-orders",
  access: "admin",
  bodySchema: createPurchaseOrderSchema,
  cacheControl: "no-store",
  handler: async ({ body, session }) => {
    const purchaseOrder = await createPurchaseOrder({
      ...body,
      createdByUserId: session.user.id,
    });

    return {
      data: {
        purchaseOrder,
      },
      status: 201,
    };
  },
});
