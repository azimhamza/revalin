"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  Loader2,
  PackageCheck,
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

function movementLabel(value: string) {
  return value.replace(/_/g, " ");
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || fallback;
}

export function InventoryManagement({
  data,
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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilters);
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
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
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

  async function postJson(url: string, body: unknown, busy: string) {
    setBusyKey(busy);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, `Request failed (${response.status}).`));
      }

      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function createCategory() {
    const ok = await postJson(
      "/api/admin/inventory/categories",
      categoryForm,
      "category",
    );
    if (ok) setCategoryForm({ name: "", code: "" });
  }

  async function createItem() {
    const ok = await postJson(
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
    if (ok) {
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
    const ok = await postJson(
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
    if (ok) {
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

  async function adjustItem(itemId: string) {
    const quantityDelta = Number(adjustments[itemId] || 0);
    const ok = await postJson(
      `/api/admin/inventory/items/${itemId}/adjustments`,
      {
        quantityDelta,
        notes: "Admin inventory adjustment",
      },
      `adjust:${itemId}`,
    );
    if (ok) {
      setAdjustments((current) => ({ ...current, [itemId]: "" }));
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Operations"
        title="Inventory"
        description="Internal stock ledger for products, packaging, labels, stickers, cards, inserts, and supplies."
        action={
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
        }
      />

      {error ? (
        <div className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <AdminStatCard label="Items" value={data.stats.totalItems} detail="Visible in current filter" />
        <AdminStatCard label="Low" value={data.stats.lowStock} detail="At reorder point" />
        <AdminStatCard label="Out" value={data.stats.outOfStock} detail="Zero on hand" />
        <AdminStatCard label="Negative" value={data.stats.negativeStock} detail="Needs cleanup" />
        <AdminStatCard label="Rules" value={data.stats.activeRules} detail="Auto deductions" />
      </div>

      <AdminPanel>
        <div className="grid gap-2 lg:grid-cols-[1fr_180px_160px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
              placeholder="Search name, code, SKU, barcode"
              className={cn(adminFieldClass, "pl-7")}
            />
          </div>
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
      </AdminPanel>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <AdminPanel>
            <AdminSectionHeader
              eyebrow="On hand"
              title="Stock ledger"
              description="Counts are calculated from internal movements, not Swell stock levels."
            />
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {data.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-none border border-border/70 bg-background px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <Badge variant="outline" className="rounded-none text-[9px]">
                          {item.code}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {item.category?.name || "Uncategorized"} · {item.itemType.replace(/_/g, " ")}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-none border px-2 py-1 text-[10px] font-semibold",
                        statusTone(item.stockStatus),
                      )}
                    >
                      {statusLabel(item.stockStatus)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        On hand
                      </p>
                      <p className="text-lg font-semibold tracking-[-0.04em]">
                        {item.currentQuantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Reorder
                      </p>
                      <p className="font-semibold">{item.reorderPoint}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Unit
                      </p>
                      <p className="font-semibold">{item.unit}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
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
                      className={adminFieldClass}
                    />
                    <button
                      type="button"
                      onClick={() => adjustItem(item.id)}
                      disabled={busyKey === `adjust:${item.id}`}
                      className={adminSecondaryButtonClass}
                    >
                      {busyKey === `adjust:${item.id}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <PackageCheck className="size-3.5" />
                      )}
                      Adjust
                    </button>
                  </div>

                  {item.sku || item.barcode || item.productHandle || item.swellVariantId ? (
                    <div className="mt-2 space-y-0.5 break-all text-[10px] text-muted-foreground">
                      {item.sku ? <p>SKU: {item.sku}</p> : null}
                      {item.barcode ? <p>Barcode: {item.barcode}</p> : null}
                      {item.productHandle ? <p>Handle: {item.productHandle}</p> : null}
                      {item.swellVariantId ? <p>Swell variant: {item.swellVariantId}</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {data.items.length === 0 ? (
                <div className="rounded-none border border-border/70 bg-background px-3 py-8 text-center text-sm text-muted-foreground lg:col-span-2">
                  No inventory items found.
                </div>
              ) : null}
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
