"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Loader2,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Truck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  PurchasingDashboardData,
  PurchaseOrderSummary,
} from "@/lib/inventory-management/service";

import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

const ORDER_STATUSES = [
  ["all", "All"],
  ["ordered", "Ordered"],
  ["partially_received", "Partial"],
  ["received", "Received"],
  ["cancelled", "Cancelled"],
] as const;

const PAYMENT_STATUSES = [
  ["all", "All payments"],
  ["unpaid", "Unpaid"],
  ["partially_paid", "Partial"],
  ["paid", "Paid"],
  ["refunded", "Refunded"],
  ["void", "Void"],
] as const;

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function formatMoney(amount: string, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(amount || 0));
}

function splitProofUrls(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusClass(status: PurchaseOrderSummary["status"]) {
  if (status === "received") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "partially_received") return "border-yellow-300 bg-yellow-50 text-yellow-900";
  if (status === "cancelled") return "border-red-200 bg-red-50 text-red-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function paymentClass(status: PurchaseOrderSummary["paymentStatus"]) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "partially_paid") return "border-yellow-300 bg-yellow-50 text-yellow-900";
  if (status === "unpaid") return "border-red-200 bg-red-50 text-red-900";
  return "border-border bg-background text-muted-foreground";
}

async function readApiError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || fallback;
}

type DraftLine = {
  key: string;
  itemId: string;
  quantityOrdered: string;
  unitCost: string;
};

export function PurchasingManagement({
  data,
  initialFilters,
}: {
  data: PurchasingDashboardData;
  initialFilters: {
    q: string;
    status: string;
    paymentStatus: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const [vendorForm, setVendorForm] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    paymentTerms: "",
  });
  const [poForm, setPoForm] = useState({
    poNumber: "",
    vendorId: "",
    currencyCode: "USD",
    expectedAt: "",
    proofUrls: "",
    notes: "",
  });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    {
      key: "line-1",
      itemId: "",
      quantityOrdered: "1",
      unitCost: "0.00",
    },
  ]);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, Record<string, string>>>({});
  const [paymentInputs, setPaymentInputs] = useState<Record<string, {
    paymentStatus: string;
    amountPaid: string;
    paymentMethod: string;
    paymentReference: string;
    proofUrls: string;
  }>>({});

  const activeItems = useMemo(
    () => data.inventoryItems.filter((item) => item.active),
    [data.inventoryItems],
  );

  function applyFilters(next = filters) {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.status !== "all") params.set("status", next.status);
    if (next.paymentStatus !== "all") params.set("paymentStatus", next.paymentStatus);

    startTransition(() => {
      router.push(`/admin/purchasing${params.size ? `?${params.toString()}` : ""}`);
      router.refresh();
    });
  }

  async function requestJson(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    busy: string,
  ) {
    setBusyKey(busy);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
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

  async function createVendor() {
    const ok = await requestJson(
      "/api/admin/purchasing/vendors",
      "POST",
      vendorForm,
      "vendor",
    );
    if (ok) {
      setVendorForm({
        name: "",
        code: "",
        email: "",
        phone: "",
        paymentTerms: "",
      });
    }
  }

  async function createPurchaseOrder() {
    const lines = draftLines
      .filter((line) => line.itemId && Number(line.quantityOrdered) > 0)
      .map((line) => ({
        itemId: line.itemId,
        quantityOrdered: Number(line.quantityOrdered),
        unitCost: line.unitCost || "0.00",
      }));

    const ok = await requestJson(
      "/api/admin/purchasing/purchase-orders",
      "POST",
      {
        ...poForm,
        vendorId: poForm.vendorId || null,
        proofUrls: splitProofUrls(poForm.proofUrls),
        lines,
      },
      "po",
    );
    if (ok) {
      setPoForm({
        poNumber: "",
        vendorId: "",
        currencyCode: "USD",
        expectedAt: "",
        proofUrls: "",
        notes: "",
      });
      setDraftLines([
        {
          key: `line-${Date.now()}`,
          itemId: "",
          quantityOrdered: "1",
          unitCost: "0.00",
        },
      ]);
    }
  }

  async function receivePurchaseOrder(order: PurchaseOrderSummary) {
    const lines = order.lines.map((line) => ({
      purchaseOrderLineId: line.id,
      quantityReceived: Number(receiveInputs[order.id]?.[line.id] || 0),
    }));

    const ok = await requestJson(
      `/api/admin/purchasing/purchase-orders/${order.id}/receipts`,
      "POST",
      {
        lines,
        notes: `Receipt for ${order.poNumber}`,
      },
      `receive:${order.id}`,
    );

    if (ok) {
      setReceiveInputs((current) => ({ ...current, [order.id]: {} }));
    }
  }

  function paymentInputFor(order: PurchaseOrderSummary) {
    return (
      paymentInputs[order.id] || {
        paymentStatus: order.paymentStatus,
        amountPaid: order.amountPaid,
        paymentMethod: order.paymentMethod || "",
        paymentReference: order.paymentReference || "",
        proofUrls: order.proofUrls.join("\n"),
      }
    );
  }

  async function updatePayment(order: PurchaseOrderSummary) {
    const input = paymentInputFor(order);
    await requestJson(
      `/api/admin/purchasing/purchase-orders/${order.id}/payment`,
      "PATCH",
      {
        ...input,
        proofUrls: splitProofUrls(input.proofUrls),
      },
      `payment:${order.id}`,
    );
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Operations"
        title="Purchasing"
        description="Purchase orders, receiving, payment status, and proof tracking for the internal inventory ledger."
      />

      {error ? (
        <div className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <AdminStatCard label="Purchase orders" value={data.stats.totalPurchaseOrders} detail="Visible in current filter" />
        <AdminStatCard label="Open" value={data.stats.openPurchaseOrders} detail="Ordered or partial" />
        <AdminStatCard label="Unpaid" value={data.stats.unpaidPurchaseOrders} detail="Unpaid or partial" />
        <AdminStatCard label="Partial receipts" value={data.stats.partiallyReceived} detail="Receiving in progress" />
      </div>

      <AdminPanel>
        <div className="grid gap-2 lg:grid-cols-[1fr_170px_170px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="Search PO, vendor, payment reference"
              className={cn(adminFieldClass, "pl-7")}
            />
          </div>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className={adminFieldClass}>
            {ORDER_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={filters.paymentStatus} onChange={(event) => setFilters((current) => ({ ...current, paymentStatus: event.target.value }))} className={adminFieldClass}>
            {PAYMENT_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="button" onClick={() => applyFilters()} disabled={isPending} className={adminPrimaryButtonClass}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Apply
          </button>
        </div>
      </AdminPanel>

      <div className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-3">
          <AdminPanel>
            <AdminSectionHeader eyebrow="Vendor" title="Create vendor" />
            <div className="mt-3 grid gap-2">
              <Input value={vendorForm.name} onChange={(event) => setVendorForm((current) => ({ ...current, name: event.target.value }))} placeholder="Vendor name" className={adminFieldClass} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={vendorForm.code} onChange={(event) => setVendorForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className={adminFieldClass} />
                <Input value={vendorForm.paymentTerms} onChange={(event) => setVendorForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="Payment terms" className={adminFieldClass} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={vendorForm.email} onChange={(event) => setVendorForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className={adminFieldClass} />
                <Input value={vendorForm.phone} onChange={(event) => setVendorForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className={adminFieldClass} />
              </div>
              <button type="button" onClick={createVendor} disabled={busyKey === "vendor"} className={adminSecondaryButtonClass}>
                {busyKey === "vendor" ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
                Add vendor
              </button>
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader eyebrow="Purchase" title="Create PO" />
            <div className="mt-3 grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={poForm.poNumber} onChange={(event) => setPoForm((current) => ({ ...current, poNumber: event.target.value }))} placeholder="PO number optional" className={adminFieldClass} />
                <Input value={poForm.currencyCode} onChange={(event) => setPoForm((current) => ({ ...current, currencyCode: event.target.value }))} placeholder="Currency" className={adminFieldClass} />
              </div>
              <select value={poForm.vendorId} onChange={(event) => setPoForm((current) => ({ ...current, vendorId: event.target.value }))} className={adminFieldClass}>
                <option value="">No vendor</option>
                {data.vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
              <Input value={poForm.expectedAt} onChange={(event) => setPoForm((current) => ({ ...current, expectedAt: event.target.value }))} type="date" className={adminFieldClass} />
              <div className="space-y-2">
                {draftLines.map((line, index) => (
                  <div key={line.key} className="grid gap-2 rounded-none border border-border/70 bg-background p-2 sm:grid-cols-[1fr_72px_92px]">
                    <select
                      value={line.itemId}
                      onChange={(event) =>
                        setDraftLines((current) =>
                          current.map((entry) =>
                            entry.key === line.key ? { ...entry, itemId: event.target.value } : entry,
                          ),
                        )
                      }
                      className={adminFieldClass}
                    >
                      <option value="">Item {index + 1}</option>
                      {activeItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
                      ))}
                    </select>
                    <Input
                      value={line.quantityOrdered}
                      onChange={(event) =>
                        setDraftLines((current) =>
                          current.map((entry) =>
                            entry.key === line.key ? { ...entry, quantityOrdered: event.target.value } : entry,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="Qty"
                      className={adminFieldClass}
                    />
                    <Input
                      value={line.unitCost}
                      onChange={(event) =>
                        setDraftLines((current) =>
                          current.map((entry) =>
                            entry.key === line.key ? { ...entry, unitCost: event.target.value } : entry,
                          ),
                        )
                      }
                      inputMode="decimal"
                      placeholder="Cost"
                      className={adminFieldClass}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftLines((current) => [
                    ...current,
                    {
                      key: `line-${Date.now()}`,
                      itemId: "",
                      quantityOrdered: "1",
                      unitCost: "0.00",
                    },
                  ])
                }
                className={adminSecondaryButtonClass}
              >
                <Plus className="size-3.5" />
                Add line
              </button>
              <Input value={poForm.proofUrls} onChange={(event) => setPoForm((current) => ({ ...current, proofUrls: event.target.value }))} placeholder="Proof URLs, comma or newline separated" className={adminFieldClass} />
              <Input value={poForm.notes} onChange={(event) => setPoForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className={adminFieldClass} />
              <button type="button" onClick={createPurchaseOrder} disabled={busyKey === "po"} className={adminPrimaryButtonClass}>
                {busyKey === "po" ? <Loader2 className="size-3.5 animate-spin" /> : <ReceiptText className="size-3.5" />}
                Create PO
              </button>
            </div>
          </AdminPanel>
        </div>

        <div className="space-y-3">
          {data.purchaseOrders.map((order) => {
            const paymentInput = paymentInputFor(order);
            return (
              <AdminPanel key={order.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold tracking-[-0.04em]">{order.poNumber}</h2>
                      <span className={cn("rounded-none border px-2 py-1 text-[10px] font-semibold capitalize", statusClass(order.status))}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                      <span className={cn("rounded-none border px-2 py-1 text-[10px] font-semibold capitalize", paymentClass(order.paymentStatus))}>
                        {order.paymentStatus.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {order.vendor?.name || "No vendor"} · {formatMoney(order.totalAmount, order.currencyCode)} · expected {formatDate(order.expectedAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-56">
                    <div className="rounded-none border border-border/70 bg-background px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Ordered</p>
                      <p className="font-semibold">{order.orderedQuantity}</p>
                    </div>
                    <div className="rounded-none border border-border/70 bg-background px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Received</p>
                      <p className="font-semibold">{order.receivedQuantity}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/70 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">Item</th>
                        <th className="px-2 py-2 font-semibold">Ordered</th>
                        <th className="px-2 py-2 font-semibold">Received</th>
                        <th className="px-2 py-2 font-semibold">Receive now</th>
                        <th className="px-2 py-2 font-semibold">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {order.lines.map((line) => (
                        <tr key={line.id} className="align-top">
                          <td className="px-2 py-2">
                            <p className="font-semibold">{line.itemName}</p>
                            <p className="text-[10px] text-muted-foreground">{line.itemCode}</p>
                          </td>
                          <td className="px-2 py-2 tabular-nums">{line.quantityOrdered}</td>
                          <td className="px-2 py-2 tabular-nums">{line.quantityReceived}</td>
                          <td className="px-2 py-2">
                            <Input
                              value={receiveInputs[order.id]?.[line.id] || ""}
                              onChange={(event) =>
                                setReceiveInputs((current) => ({
                                  ...current,
                                  [order.id]: {
                                    ...(current[order.id] || {}),
                                    [line.id]: event.target.value,
                                  },
                                }))
                              }
                              disabled={line.quantityRemaining === 0}
                              inputMode="numeric"
                              placeholder={String(line.quantityRemaining)}
                              className={cn(adminFieldClass, "w-20")}
                            />
                          </td>
                          <td className="px-2 py-2">{formatMoney(line.unitCost, order.currencyCode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => receivePurchaseOrder(order)}
                    disabled={busyKey === `receive:${order.id}` || order.status === "received"}
                    className={adminPrimaryButtonClass}
                  >
                    {busyKey === `receive:${order.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
                    Receive
                  </button>
                  {order.proofUrls.map((url) => (
                    <Button key={url} asChild variant="outline" size="sm" className="h-7 rounded-none px-2.5 text-[10px] uppercase tracking-[0.14em]">
                      <a href={url} target="_blank" rel="noreferrer">Proof</a>
                    </Button>
                  ))}
                </div>

                <details className="mt-3 rounded-none border border-border/70 bg-background px-3 py-2">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Payment
                  </summary>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[150px_120px_1fr_1fr]">
                    <select
                      value={paymentInput.paymentStatus}
                      onChange={(event) =>
                        setPaymentInputs((current) => ({
                          ...current,
                          [order.id]: {
                            ...paymentInput,
                            paymentStatus: event.target.value,
                          },
                        }))
                      }
                      className={adminFieldClass}
                    >
                      {PAYMENT_STATUSES.filter(([value]) => value !== "all").map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <Input
                      value={paymentInput.amountPaid}
                      onChange={(event) =>
                        setPaymentInputs((current) => ({
                          ...current,
                          [order.id]: {
                            ...paymentInput,
                            amountPaid: event.target.value,
                          },
                        }))
                      }
                      inputMode="decimal"
                      placeholder="Paid"
                      className={adminFieldClass}
                    />
                    <Input
                      value={paymentInput.paymentMethod}
                      onChange={(event) =>
                        setPaymentInputs((current) => ({
                          ...current,
                          [order.id]: {
                            ...paymentInput,
                            paymentMethod: event.target.value,
                          },
                        }))
                      }
                      placeholder="Payment method"
                      className={adminFieldClass}
                    />
                    <Input
                      value={paymentInput.paymentReference}
                      onChange={(event) =>
                        setPaymentInputs((current) => ({
                          ...current,
                          [order.id]: {
                            ...paymentInput,
                            paymentReference: event.target.value,
                          },
                        }))
                      }
                      placeholder="Reference"
                      className={adminFieldClass}
                    />
                  </div>
                  <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_auto]">
                    <Input
                      value={paymentInput.proofUrls}
                      onChange={(event) =>
                        setPaymentInputs((current) => ({
                          ...current,
                          [order.id]: {
                            ...paymentInput,
                            proofUrls: event.target.value,
                          },
                        }))
                      }
                      placeholder="Proof URLs"
                      className={adminFieldClass}
                    />
                    <button
                      type="button"
                      onClick={() => updatePayment(order)}
                      disabled={busyKey === `payment:${order.id}`}
                      className={adminSecondaryButtonClass}
                    >
                      {busyKey === `payment:${order.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
                      Save payment
                    </button>
                  </div>
                </details>
              </AdminPanel>
            );
          })}

          {data.purchaseOrders.length === 0 ? (
            <AdminPanel>
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No purchase orders found.
              </div>
            </AdminPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
