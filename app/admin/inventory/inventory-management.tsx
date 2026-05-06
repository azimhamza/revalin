"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Loader2,
  Minus,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  InventoryDashboardData,
  InventoryItemSummary,
  InventoryMovementSummary,
} from "@/lib/inventory-management/service";

import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

const ITEM_TYPES = [
  ["sellable_product", "Sellable product"],
  ["packaging", "Packaging"],
  ["label", "Label"],
  ["sticker", "Sticker"],
  ["card", "Card"],
  ["insert", "Insert"],
  ["supply", "Supply"],
  ["other", "Other"],
] as const;

const STOCK_FILTERS = [
  ["all", "All"],
  ["low_stock", "Low"],
  ["out_of_stock", "Out"],
  ["negative", "Negative"],
  ["in_stock", "Ready"],
] as const;

const READINESS_FILTERS = [
  ["all", "All shipping states"],
  ["ready", "Ready for 2-3 days"],
  ["high_demand", "High demand / about 1 week"],
  ["missing_mapping", "Missing Swell mapping"],
] as const;

type ReadinessStatus = (typeof READINESS_FILTERS)[number][0];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function statusTone(status: InventoryItemSummary["stockStatus"]) {
  if (status === "negative") return "border-red-300 bg-red-50 text-red-900";
  if (status === "out_of_stock") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "low_stock") return "border-yellow-300 bg-yellow-50 text-yellow-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function statusLabel(status: InventoryItemSummary["stockStatus"]) {
  if (status === "negative") return "Negative";
  if (status === "out_of_stock") return "Out";
  if (status === "low_stock") return "Low";
  return "Ready";
}

function itemTypeLabel(value: string) {
  return value.replace(/_/g, " ");
}

function movementLabel(value: string) {
  return value.replace(/_/g, " ");
}

function hasStorefrontMapping(item: InventoryItemSummary) {
  if (item.itemType !== "sellable_product") return true;
  return Boolean(
    item.swellVariantId?.trim() ||
      item.swellProductId?.trim() ||
      item.sku?.trim() ||
      item.productHandle?.trim(),
  );
}

function getReadinessStatus(item: InventoryItemSummary): Exclude<ReadinessStatus, "all"> {
  if (item.itemType === "sellable_product" && !hasStorefrontMapping(item)) {
    return "missing_mapping";
  }

  if (item.itemType === "sellable_product" && item.currentQuantity <= 0) {
    return "high_demand";
  }

  return "ready";
}

function readinessLabel(status: Exclude<ReadinessStatus, "all">) {
  if (status === "missing_mapping") return "Missing mapping";
  if (status === "high_demand") return "High demand";
  return "2-3 day ready";
}

function readinessTone(status: Exclude<ReadinessStatus, "all">) {
  if (status === "missing_mapping") return "border-red-300 bg-red-50 text-red-900";
  if (status === "high_demand") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function readApiErrorPayload(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

function stockStatusForQuantity(
  quantity: number,
  reorderPoint: number,
): InventoryItemSummary["stockStatus"] {
  if (quantity < 0) return "negative";
  if (quantity === 0) return "out_of_stock";
  if (reorderPoint > 0 && quantity <= reorderPoint) return "low_stock";
  return "in_stock";
}

function formatApiDate(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

type ManualAdjustmentMovement = {
  id: string;
  itemId: string;
  movementType: string;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: string | null;
  purchaseOrderId: string | null;
  purchaseReceiptId: string | null;
  checkoutOrderId: string | null;
  checkoutOrderNumber: string | null;
  notes: string | null;
  metadata: unknown;
  createdAt: string | Date;
};

type ManualAdjustmentResponse = {
  movement: ManualAdjustmentMovement;
};

export function InventoryManagement({
  data: initialData,
  initialFilters,
}: {
  data: InventoryDashboardData;
  initialFilters: {
    q: string;
    categoryId: string;
    itemType: string;
    stockStatus: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickFeedback, setQuickFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    productsSeen: number;
    variantsSeen: number;
    created: number;
    updated: number;
  } | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [readinessFilter, setReadinessFilter] = useState<ReadinessStatus>("all");
  const [categoryForm, setCategoryForm] = useState({ name: "", code: "" });
  const [itemForm, setItemForm] = useState({
    name: "",
    code: "",
    categoryId: "",
    defaultVendorId: "",
    itemType: "supply",
    unit: "unit",
    sku: "",
    barcode: "",
    location: "",
    reorderPoint: "0",
    initialQuantity: "0",
    productHandle: "",
    swellProductId: "",
    swellVariantId: "",
    notes: "",
  });

  useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [quickAdjustment, setQuickAdjustment] = useState({
    itemId: "",
    mode: "remove" as "add" | "remove",
    quantity: "1",
    notes: "",
  });
  const [ruleForm, setRuleForm] = useState({
    name: "",
    consumedItemId: "",
    appliesToItemId: "",
    appliesToProductHandle: "",
    appliesToSwellProductId: "",
    appliesToSwellVariantId: "",
    quantityPerOrder: "1",
    notes: "",
  });

  const selectableItems = useMemo(
    () => data.items.filter((item) => item.active),
    [data.items],
  );
  const quickItem = useMemo(
    () => data.items.find((item) => item.id === quickAdjustment.itemId) || null,
    [data.items, quickAdjustment.itemId],
  );
  const dashboard = useMemo(() => {
    const priority: Record<InventoryItemSummary["stockStatus"], number> = {
      negative: 0,
      out_of_stock: 1,
      low_stock: 2,
      in_stock: 3,
    };
    const attentionItems = data.items
      .filter((item) => item.stockStatus !== "in_stock")
      .sort((a, b) => {
        const statusSort = priority[a.stockStatus] - priority[b.stockStatus];
        if (statusSort !== 0) return statusSort;
        return a.currentQuantity - b.currentQuantity;
      })
      .slice(0, 6);
    const totalOnHand = data.items.reduce(
      (total, item) => total + item.currentQuantity,
      0,
    );
    const fulfillmentUses = data.movements.filter(
      (movement) => movement.movementType === "fulfillment_consumed",
    ).length;
    const purchaseReceipts = data.movements.filter(
      (movement) => movement.movementType === "purchase_received",
    ).length;
    const manualAdjustments = data.movements.filter(
      (movement) => movement.movementType === "manual_adjustment",
    ).length;
    const typeCounts = ITEM_TYPES.map(([value, label]) => ({
      value,
      label,
      count: data.items.filter((item) => item.itemType === value).length,
      lowCount: data.items.filter(
        (item) => item.itemType === value && item.stockStatus !== "in_stock",
      ).length,
    })).filter((entry) => entry.count > 0);

    return {
      attentionItems,
      totalOnHand,
      fulfillmentUses,
      purchaseReceipts,
      manualAdjustments,
      typeCounts,
    };
  }, [data.items, data.movements]);
  const readinessStats = useMemo(() => {
    const sellableItems = data.items.filter((item) => item.itemType === "sellable_product");

    return {
      ready: sellableItems.filter((item) => getReadinessStatus(item) === "ready").length,
      highDemand: sellableItems.filter((item) => getReadinessStatus(item) === "high_demand").length,
      missingMapping: sellableItems.filter((item) => getReadinessStatus(item) === "missing_mapping").length,
    };
  }, [data.items]);
  const visibleItems = useMemo(
    () =>
      data.items.filter((item) =>
        readinessFilter === "all"
          ? true
          : getReadinessStatus(item) === readinessFilter,
      ),
    [data.items, readinessFilter],
  );

  function applyFilters(next = filters) {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.categoryId !== "all") params.set("categoryId", next.categoryId);
    if (next.itemType !== "all") params.set("itemType", next.itemType);
    if (next.stockStatus !== "all") params.set("stockStatus", next.stockStatus);

    startTransition(() => {
      router.push(`/admin/inventory${params.size ? `?${params.toString()}` : ""}`);
      router.refresh();
    });
  }

  async function postJson<TData>(url: string, body: unknown, busy: string) {
    setBusyKey(busy);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as
        | { data?: TData; error?: { message?: string } }
        | null;

      if (!response.ok) {
        throw new Error(
          readApiErrorPayload(payload, `Request failed (${response.status}).`),
        );
      }

      router.refresh();
      return { ok: true as const, data: payload?.data ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setBusyKey(null);
    }
  }

  function applyMovementLocally(movement: ManualAdjustmentMovement) {
    setData((current) => {
      const movementItem = current.items.find((item) => item.id === movement.itemId);
      const updatedItems = current.items.map((item) => {
        if (item.id !== movement.itemId) return item;

        return {
          ...item,
          currentQuantity: movement.quantityAfter,
          stockStatus: stockStatusForQuantity(
            movement.quantityAfter,
            item.reorderPoint,
          ),
        };
      });
      const movementSummary: InventoryMovementSummary = {
        id: movement.id,
        itemId: movement.itemId,
        itemName: movementItem?.name || "Inventory item",
        itemCode: movementItem?.code || "UNKNOWN",
        movementType: movement.movementType,
        quantityDelta: movement.quantityDelta,
        quantityAfter: movement.quantityAfter,
        unitCost: movement.unitCost,
        purchaseOrderId: movement.purchaseOrderId,
        purchaseOrderNumber: null,
        purchaseReceiptId: movement.purchaseReceiptId,
        checkoutOrderId: movement.checkoutOrderId,
        checkoutOrderNumber: movement.checkoutOrderNumber,
        notes: movement.notes,
        metadata: movement.metadata,
        createdAt: formatApiDate(movement.createdAt),
      };

      return {
        ...current,
        items: updatedItems,
        movements: [
          movementSummary,
          ...current.movements.filter((entry) => entry.id !== movement.id),
        ].slice(0, 75),
        stats: {
          ...current.stats,
          totalItems: updatedItems.length,
          lowStock: updatedItems.filter((item) => item.stockStatus === "low_stock").length,
          outOfStock: updatedItems.filter((item) => item.stockStatus === "out_of_stock").length,
          negativeStock: updatedItems.filter((item) => item.stockStatus === "negative").length,
        },
      };
    });
  }

  async function syncSwellCatalog() {
    setBusyKey("sync-swell");
    setError(null);
    setSyncSummary(null);

    try {
      const response = await fetch("/api/admin/inventory/sync-swell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error?.message || `Sync failed (${response.status}).`);
      }

      const summary = payload?.data;
      if (summary) {
        setSyncSummary({
          productsSeen: Number(summary.productsSeen || 0),
          variantsSeen: Number(summary.variantsSeen || 0),
          created: Number(summary.created || 0),
          updated: Number(summary.updated || 0),
        });
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swell sync failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createCategory() {
    const result = await postJson(
      "/api/admin/inventory/categories",
      categoryForm,
      "category",
    );
    if (result.ok) setCategoryForm({ name: "", code: "" });
  }

  async function createItem() {
    const result = await postJson(
      "/api/admin/inventory/items",
      {
        ...itemForm,
        categoryId: itemForm.categoryId || null,
        defaultVendorId: itemForm.defaultVendorId || null,
        reorderPoint: Number(itemForm.reorderPoint || 0),
        initialQuantity: Number(itemForm.initialQuantity || 0),
      },
      "item",
    );
    if (result.ok) {
      setItemForm((current) => ({
        ...current,
        name: "",
        code: "",
        sku: "",
        barcode: "",
        location: "",
        reorderPoint: "0",
        initialQuantity: "0",
        productHandle: "",
        swellProductId: "",
        swellVariantId: "",
        notes: "",
      }));
    }
  }

  async function createRule() {
    const result = await postJson(
      "/api/admin/inventory/consumption-rules",
      {
        ...ruleForm,
        consumedItemId: ruleForm.consumedItemId,
        appliesToItemId: ruleForm.appliesToItemId || null,
        appliesToProductHandle: ruleForm.appliesToProductHandle || null,
        appliesToSwellProductId: ruleForm.appliesToSwellProductId || null,
        appliesToSwellVariantId: ruleForm.appliesToSwellVariantId || null,
        quantityPerOrder: Number(ruleForm.quantityPerOrder || 1),
      },
      "rule",
    );
    if (result.ok) {
      setRuleForm({
        name: "",
        consumedItemId: "",
        appliesToItemId: "",
        appliesToProductHandle: "",
        appliesToSwellProductId: "",
        appliesToSwellVariantId: "",
        quantityPerOrder: "1",
        notes: "",
      });
    }
  }

  async function adjustItem(
    itemId: string,
    overrideDelta?: number,
    overrideNotes?: string,
  ) {
    const quantityDelta =
      typeof overrideDelta === "number"
        ? overrideDelta
        : Number(adjustments[itemId] || 0);
    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
      setError("Enter a non-zero quantity to add or remove.");
      return;
    }

    const result = await postJson<ManualAdjustmentResponse>(
      `/api/admin/inventory/items/${itemId}/adjustments`,
      {
        quantityDelta,
        notes: overrideNotes || "Admin inventory adjustment",
      },
      `adjust:${itemId}`,
    );
    if (result.ok) {
      if (result.data?.movement) {
        applyMovementLocally(result.data.movement);
      }
      setAdjustments((current) => ({ ...current, [itemId]: "" }));
    }
  }

  async function submitQuickAdjustment() {
    setQuickFeedback(null);
    const itemId = quickAdjustment.itemId || selectableItems[0]?.id || "";
    const quantity = Math.floor(Number(quickAdjustment.quantity || 0));
    if (!itemId) {
      const message = "Create or select an item first.";
      setError(message);
      setQuickFeedback({ tone: "error", text: message });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      const message = "Quick stock quantity must be a positive whole number.";
      setError(message);
      setQuickFeedback({ tone: "error", text: message });
      return;
    }

    const delta = quickAdjustment.mode === "add" ? quantity : -quantity;
    const selectedItem = data.items.find((item) => item.id === itemId);
    const result = await postJson<ManualAdjustmentResponse>(
      `/api/admin/inventory/items/${itemId}/adjustments`,
      {
        quantityDelta: delta,
        notes:
          quickAdjustment.notes ||
          `${quickAdjustment.mode === "add" ? "Quick add" : "Quick remove"}${
            selectedItem ? ` from ${selectedItem.name}` : ""
          }`,
      },
      `adjust:${itemId}`,
    );
    if (result.ok) {
      const movement = result.data?.movement;
      if (movement) {
        applyMovementLocally(movement);
        setQuickFeedback({
          tone: "success",
          text: `Saved ${delta > 0 ? "+" : ""}${delta} ${
            selectedItem?.unit || "unit"
          }. New on hand: ${movement.quantityAfter}.`,
        });
      } else {
        setQuickFeedback({
          tone: "success",
          text: "Stock change saved.",
        });
      }
      setQuickAdjustment((current) => ({
        ...current,
        quantity: "1",
        notes: "",
      }));
    } else {
      setQuickFeedback({ tone: "error", text: result.error });
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Operations"
        title="Inventory"
        description="Internal stock ledger for products, packaging, labels, stickers, cards, inserts, and supplies."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={syncSwellCatalog}
              disabled={busyKey === "sync-swell"}
              className="h-7 rounded-none px-2.5 text-[10px] uppercase tracking-[0.14em]"
            >
              {busyKey === "sync-swell" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Sync Swell products
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
              className="h-7 rounded-none px-2.5 text-[10px] uppercase tracking-[0.14em]"
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      ) : null}

      {syncSummary ? (
        <div className="rounded-none border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
          Synced {syncSummary.productsSeen} Swell products and {syncSummary.variantsSeen} sellable options.
          Created {syncSummary.created}, updated {syncSummary.updated}. Quantities were not changed.
        </div>
      ) : null}

      <AdminPanel tone="inverse" className="p-3 md:p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
                  Dashboard
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.05em] md:text-2xl">
                  Stock control
                </h2>
                <p className="mt-1 max-w-2xl text-[11px] leading-4 text-sidebar-foreground/70">
                  Fast count changes, low-stock visibility, and recent movement activity from the internal ledger.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                    On hand
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {dashboard.totalOnHand}
                  </p>
                </div>
                <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                    Used
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {dashboard.fulfillmentUses}
                  </p>
                </div>
                <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                    Received
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {dashboard.purchaseReceipts}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="border border-sidebar-border bg-sidebar-accent/20 p-2.5">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                  <AlertTriangle className="size-3.5" />
                  Needs attention
                </div>
                <div className="space-y-1.5">
                  {dashboard.attentionItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setQuickAdjustment((current) => ({
                          ...current,
                          itemId: item.id,
                          mode: item.currentQuantity <= 0 ? "add" : current.mode,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-2 border border-sidebar-border bg-sidebar px-2 py-1.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {item.name}
                        </span>
                        <span className="block text-[10px] text-sidebar-foreground/60">
                          {item.code} · reorder {item.reorderPoint}
                        </span>
                      </span>
                      <span className="text-right text-sm font-semibold tabular-nums">
                        {item.currentQuantity}
                      </span>
                    </button>
                  ))}
                  {dashboard.attentionItems.length === 0 ? (
                    <p className="border border-sidebar-border bg-sidebar px-2 py-3 text-xs text-sidebar-foreground/65">
                      No low, out, or negative stock in this view.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border border-sidebar-border bg-sidebar-accent/20 p-2.5">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                  <BarChart3 className="size-3.5" />
                  Stock mix
                </div>
                <div className="space-y-2">
                  {dashboard.typeCounts.slice(0, 6).map((entry) => (
                    <div key={entry.value} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="capitalize text-sidebar-foreground/80">
                          {entry.label}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {entry.count}
                          {entry.lowCount > 0 ? (
                            <span className="ml-1 text-yellow-200">
                              ({entry.lowCount})
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="h-1.5 bg-sidebar-border">
                        <div
                          className="h-full bg-sidebar-primary"
                          style={{
                            width: `${Math.max(
                              8,
                              Math.round((entry.count / Math.max(1, data.items.length)) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {dashboard.typeCounts.length === 0 ? (
                    <p className="border border-sidebar-border bg-sidebar px-2 py-3 text-xs text-sidebar-foreground/65">
                      Create inventory items to populate the mix.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-sidebar-border bg-sidebar p-3">
            <div className="flex items-center gap-2">
              {quickAdjustment.mode === "add" ? (
                <PackagePlus className="size-4 text-emerald-200" />
              ) : (
                <PackageMinus className="size-4 text-amber-200" />
              )}
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
                  Phone action
                </p>
                <h3 className="text-base font-semibold tracking-[-0.04em]">
                  Quick add / remove
                </h3>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <select
                value={quickAdjustment.itemId}
                onChange={(event) =>
                  setQuickAdjustment((current) => ({
                    ...current,
                    itemId: event.target.value,
                  }))
                }
                className={cn(adminFieldClass, "border-sidebar-border bg-sidebar")}
              >
                <option value="">Select item</option>
                {selectableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQuickAdjustment((current) => ({ ...current, mode: "add" }))
                  }
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 border text-xs font-semibold uppercase tracking-[0.14em]",
                    quickAdjustment.mode === "add"
                      ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                      : "border-sidebar-border bg-sidebar-accent/20 text-sidebar-foreground",
                  )}
                >
                  <Plus className="size-4" />
                  Add
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setQuickAdjustment((current) => ({ ...current, mode: "remove" }))
                  }
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 border text-xs font-semibold uppercase tracking-[0.14em]",
                    quickAdjustment.mode === "remove"
                      ? "border-amber-300 bg-amber-300 text-amber-950"
                      : "border-sidebar-border bg-sidebar-accent/20 text-sidebar-foreground",
                  )}
                >
                  <Minus className="size-4" />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-[110px_1fr] gap-2">
                <Input
                  type="number"
                  value={quickAdjustment.quantity}
                  onChange={(event) =>
                    setQuickAdjustment((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="Qty"
                  className={cn(adminFieldClass, "h-10 border-sidebar-border bg-sidebar text-base")}
                />
                <Input
                  value={quickAdjustment.notes}
                  onChange={(event) =>
                    setQuickAdjustment((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Reason or order note"
                  className={cn(adminFieldClass, "h-10 border-sidebar-border bg-sidebar")}
                />
              </div>

              {quickItem ? (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                      Now
                    </p>
                    <p className="font-semibold tabular-nums">
                      {quickItem.currentQuantity}
                    </p>
                  </div>
                  <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                      Reorder
                    </p>
                    <p className="font-semibold tabular-nums">
                      {quickItem.reorderPoint}
                    </p>
                  </div>
                  <div className="border border-sidebar-border bg-sidebar-accent/20 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                      Unit
                    </p>
                    <p className="font-semibold">{quickItem.unit}</p>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={submitQuickAdjustment}
                disabled={
                  !selectableItems.length ||
                  busyKey === `adjust:${quickAdjustment.itemId || selectableItems[0]?.id}`
                }
                className={cn(adminPrimaryButtonClass, "h-10 text-xs")}
              >
                {busyKey === `adjust:${quickAdjustment.itemId || selectableItems[0]?.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : quickAdjustment.mode === "add" ? (
                  <PackagePlus className="size-4" />
                ) : (
                  <PackageMinus className="size-4" />
                )}
                Save stock change
              </button>

              {quickFeedback ? (
                <div
                  aria-live="polite"
                  className={cn(
                    "border px-2.5 py-2 text-xs",
                    quickFeedback.tone === "success"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-red-300 bg-red-50 text-red-950",
                  )}
                >
                  {quickFeedback.text}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AdminPanel>

      <div className="grid gap-3 md:grid-cols-5">
        <AdminStatCard label="Items" value={data.stats.totalItems} detail="Visible in current filter" />
        <AdminStatCard label="Low" value={data.stats.lowStock} detail="At reorder point" />
        <AdminStatCard label="Out" value={data.stats.outOfStock} detail="Zero on hand" />
        <AdminStatCard label="Negative" value={data.stats.negativeStock} detail="Needs cleanup" />
        <AdminStatCard label="Rules" value={data.stats.activeRules} detail="Auto deductions" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <AdminStatCard label="2-3 day ready" value={readinessStats.ready} detail="Sellable items with internal stock" />
        <AdminStatCard label="High demand" value={readinessStats.highDemand} detail="Sellable items showing about 1 week" />
        <AdminStatCard label="Missing mapping" value={readinessStats.missingMapping} detail="Defaults to high-demand copy" />
      </div>

      <AdminPanel>
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_170px_150px_210px_auto]">
          <label className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Search
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.q}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, q: event.target.value }))
                }
                placeholder="Name, code, SKU, barcode"
                className={cn(adminFieldClass, "pl-7")}
              />
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Category
            </span>
            <select
              value={filters.categoryId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, categoryId: event.target.value }))
              }
              className={adminFieldClass}
            >
              <option value="all">All categories</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Type
            </span>
            <select
              value={filters.itemType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, itemType: event.target.value }))
              }
              className={adminFieldClass}
            >
              <option value="all">All types</option>
              {ITEM_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Stock
            </span>
            <select
              value={filters.stockStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  stockStatus: event.target.value,
                }))
              }
              className={adminFieldClass}
            >
              {STOCK_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Storefront
            </span>
            <select
              value={readinessFilter}
              onChange={(event) => setReadinessFilter(event.target.value as ReadinessStatus)}
              className={adminFieldClass}
            >
              {READINESS_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-transparent">
              Apply
            </span>
            <button
              type="button"
              onClick={() => applyFilters()}
              disabled={isPending}
              className={adminPrimaryButtonClass}
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Apply
            </button>
          </div>
        </div>
      </AdminPanel>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <AdminPanel>
            <AdminSectionHeader
              eyebrow="On hand"
              title="Stock ledger"
              description="Table view of internal counts. Filter by category or type to isolate sellable products, supplies, packaging, labels, and the rest."
            />
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[1040px] w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Category / Type</th>
                    <th className="px-2 py-2 text-right font-semibold">On hand</th>
                    <th className="px-2 py-2 text-right font-semibold">Reorder</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Storefront mapping</th>
                    <th className="px-2 py-2 font-semibold">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleItems.map((item) => {
                    const readinessStatus = getReadinessStatus(item);
                    const missingStorefrontMapping =
                      item.itemType === "sellable_product" && readinessStatus === "missing_mapping";
                    const showStorefrontFields =
                      item.itemType === "sellable_product" ||
                      Boolean(item.sku || item.productHandle || item.swellProductId || item.swellVariantId);

                    return (
                      <tr key={item.id} className="align-top hover:bg-muted/40">
                        <td className="px-2 py-3">
                          <div className="max-w-[260px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-semibold leading-tight">{item.name}</p>
                              <Badge variant="outline" className="rounded-none text-[9px]">
                                {item.code}
                              </Badge>
                            </div>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {item.location ? item.location : "No location"}
                            </p>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <p className="font-medium">{item.category?.name || "Uncategorized"}</p>
                          <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                            {itemTypeLabel(item.itemType)}
                          </p>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <p className="text-base font-semibold tabular-nums">{item.currentQuantity}</p>
                          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold tabular-nums">
                          {item.reorderPoint}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <span
                              className={cn(
                                "rounded-none border px-2 py-1 text-[10px] font-semibold",
                                statusTone(item.stockStatus),
                              )}
                            >
                              {statusLabel(item.stockStatus)}
                            </span>
                            {item.itemType === "sellable_product" ? (
                              <span
                                className={cn(
                                  "rounded-none border px-2 py-1 text-[10px] font-semibold",
                                  readinessTone(readinessStatus),
                                )}
                              >
                                {readinessLabel(readinessStatus)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          {showStorefrontFields || item.barcode ? (
                            <div className="max-w-[260px] space-y-0.5 break-all text-[10px] text-muted-foreground">
                              <p>SKU: {item.sku || "Not set"}</p>
                              {item.barcode ? <p>Barcode: {item.barcode}</p> : null}
                              <p>Handle: {item.productHandle || "Not set"}</p>
                              <p>Swell product: {item.swellProductId || "Not set"}</p>
                              <p>Swell variant: {item.swellVariantId || "Not set"}</p>
                              {missingStorefrontMapping ? (
                                <p className="mt-1 rounded-none border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-900">
                                  Missing mapping; customers see about 1 week due to high demand.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not storefront matched</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <div className="grid min-w-[230px] gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  adjustItem(item.id, 1, `Quick add 1 ${item.unit}`)
                                }
                                disabled={busyKey === `adjust:${item.id}`}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-none border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900 hover:bg-emerald-100"
                              >
                                <PackagePlus className="size-3.5" />
                                Add 1
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  adjustItem(item.id, -1, `Quick remove 1 ${item.unit}`)
                                }
                                disabled={busyKey === `adjust:${item.id}`}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-none border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900 hover:bg-amber-100"
                              >
                                <PackageMinus className="size-3.5" />
                                Remove 1
                              </button>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <Input
                                value={adjustments[item.id] || ""}
                                onChange={(event) =>
                                  setAdjustments((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                inputMode="numeric"
                                placeholder="+10 or -2"
                                className={cn(adminFieldClass, "h-8")}
                              />
                              <button
                                type="button"
                                onClick={() => adjustItem(item.id)}
                                disabled={busyKey === `adjust:${item.id}`}
                                className={cn(adminSecondaryButtonClass, "h-8 px-2")}
                              >
                                {busyKey === `adjust:${item.id}` ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <PackageCheck className="size-3.5" />
                                )}
                                Adjust
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-sm text-muted-foreground">
                        No inventory items found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader
              eyebrow="Audit"
              title="Movement history"
              description="Every movement links back to a purchase, adjustment, or fulfillment order when available."
            />
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Item</th>
                    <th className="px-2 py-2 font-semibold">Movement</th>
                    <th className="px-2 py-2 font-semibold">Delta</th>
                    <th className="px-2 py-2 font-semibold">Source</th>
                    <th className="px-2 py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.movements.map((movement) => (
                    <tr key={movement.id} className="align-top">
                      <td className="px-2 py-2">
                        <p className="font-semibold">{movement.itemName}</p>
                        <p className="text-[10px] text-muted-foreground">{movement.itemCode}</p>
                      </td>
                      <td className="px-2 py-2 capitalize">{movementLabel(movement.movementType)}</td>
                      <td className="px-2 py-2 font-semibold tabular-nums">
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {movement.quantityDelta}
                        <p className="text-[10px] font-normal text-muted-foreground">
                          after {movement.quantityAfter}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground">
                        {movement.checkoutOrderId ? (
                          <p>Order {movement.checkoutOrderNumber || movement.checkoutOrderId}</p>
                        ) : movement.purchaseOrderNumber ? (
                          <p>PO {movement.purchaseOrderNumber}</p>
                        ) : (
                          <p>{movement.notes || "Adjustment"}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground">
                        {formatDateTime(movement.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {data.movements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-8 text-center text-sm text-muted-foreground">
                        No inventory movements yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </AdminPanel>
        </div>

        <div className="space-y-3">
          <AdminPanel>
            <AdminSectionHeader
              eyebrow="Setup"
              title="Create item"
              description="Use internal codes for physical counts; Swell fields are identifiers only."
            />
            <div className="mt-3 grid gap-2">
              <Input
                value={itemForm.name}
                onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Item name"
                className={adminFieldClass}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={itemForm.code}
                  onChange={(event) => setItemForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="Internal code"
                  className={adminFieldClass}
                />
                <select
                  value={itemForm.itemType}
                  onChange={(event) => setItemForm((current) => ({ ...current, itemType: event.target.value }))}
                  className={adminFieldClass}
                >
                  {ITEM_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={itemForm.categoryId}
                  onChange={(event) => setItemForm((current) => ({ ...current, categoryId: event.target.value }))}
                  className={adminFieldClass}
                >
                  <option value="">No category</option>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <select
                  value={itemForm.defaultVendorId}
                  onChange={(event) => setItemForm((current) => ({ ...current, defaultVendorId: event.target.value }))}
                  className={adminFieldClass}
                >
                  <option value="">No default vendor</option>
                  {data.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" className={adminFieldClass} />
                <Input value={itemForm.reorderPoint} onChange={(event) => setItemForm((current) => ({ ...current, reorderPoint: event.target.value }))} inputMode="numeric" placeholder="Reorder point" className={adminFieldClass} />
                <Input value={itemForm.initialQuantity} onChange={(event) => setItemForm((current) => ({ ...current, initialQuantity: event.target.value }))} inputMode="numeric" placeholder="Opening qty" className={adminFieldClass} />
              </div>
              <Input value={itemForm.location} onChange={(event) => setItemForm((current) => ({ ...current, location: event.target.value }))} placeholder="Location" className={adminFieldClass} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} placeholder="SKU" className={adminFieldClass} />
                <Input value={itemForm.barcode} onChange={(event) => setItemForm((current) => ({ ...current, barcode: event.target.value }))} placeholder="Barcode" className={adminFieldClass} />
              </div>
              <Input value={itemForm.productHandle} onChange={(event) => setItemForm((current) => ({ ...current, productHandle: event.target.value }))} placeholder="Product handle match" className={adminFieldClass} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={itemForm.swellProductId} onChange={(event) => setItemForm((current) => ({ ...current, swellProductId: event.target.value }))} placeholder="Swell product ID" className={adminFieldClass} />
                <Input value={itemForm.swellVariantId} onChange={(event) => setItemForm((current) => ({ ...current, swellVariantId: event.target.value }))} placeholder="Swell variant ID" className={adminFieldClass} />
              </div>
              <button
                type="button"
                onClick={createItem}
                disabled={busyKey === "item"}
                className={adminPrimaryButtonClass}
              >
                {busyKey === "item" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Create item
              </button>
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader eyebrow="Setup" title="Create category" />
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
              <Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Category name" className={adminFieldClass} />
              <Input value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className={adminFieldClass} />
              <button type="button" onClick={createCategory} disabled={busyKey === "category"} className={adminSecondaryButtonClass}>
                {busyKey === "category" ? <Loader2 className="size-3.5 animate-spin" /> : <Boxes className="size-3.5" />}
                Add
              </button>
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader
              eyebrow="Fulfillment"
              title="Consumption rules"
              description="Global rules deduct once per packed order; matched rules deduct when the order contains the selected product."
            />
            <div className="mt-3 grid gap-2">
              <Input value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} placeholder="Rule name" className={adminFieldClass} />
              <select value={ruleForm.consumedItemId} onChange={(event) => setRuleForm((current) => ({ ...current, consumedItemId: event.target.value }))} className={adminFieldClass}>
                <option value="">Consumed item</option>
                {selectableItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={ruleForm.quantityPerOrder} onChange={(event) => setRuleForm((current) => ({ ...current, quantityPerOrder: event.target.value }))} inputMode="numeric" placeholder="Qty per order" className={adminFieldClass} />
                <select value={ruleForm.appliesToItemId} onChange={(event) => setRuleForm((current) => ({ ...current, appliesToItemId: event.target.value }))} className={adminFieldClass}>
                  <option value="">Global rule</option>
                  {selectableItems.filter((item) => item.itemType === "sellable_product").map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
                  ))}
                </select>
              </div>
              <Input value={ruleForm.appliesToProductHandle} onChange={(event) => setRuleForm((current) => ({ ...current, appliesToProductHandle: event.target.value }))} placeholder="Optional product handle match" className={adminFieldClass} />
              <button type="button" onClick={createRule} disabled={busyKey === "rule"} className={adminPrimaryButtonClass}>
                {busyKey === "rule" ? <Loader2 className="size-3.5 animate-spin" /> : <ClipboardList className="size-3.5" />}
                Add rule
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {data.rules.map((rule) => (
                <div key={rule.id} className="rounded-none border border-border/70 bg-background px-2.5 py-2 text-xs">
                  <p className="font-semibold">{rule.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Deduct {rule.quantityPerOrder} x {rule.consumedItemCode}
                    {rule.appliesToProductHandle ? ` for ${rule.appliesToProductHandle}` : rule.appliesToItemId ? " for matched item" : " globally"}
                  </p>
                </div>
              ))}
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
