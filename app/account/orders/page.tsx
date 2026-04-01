import { getServerSession } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { getOrdersForUser } from "@/lib/checkout/order-queries";
import { formatPrice } from "@/lib/swell/utils";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Package2,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  accountChipClass,
  accountIconFrameClass,
  accountIconTileClass,
  accountInsetClass,
  accountMutedPanelClass,
  accountPanelClass,
  accountPrimaryButtonClass,
  accountStatusChipClass,
} from "../account-theme";
import {
  formatAccountDate,
  getOrderItemCount,
  getOrderStatusClasses,
  getOrderStatusLabel,
} from "../account-utils";

export const metadata = {
  title: "Order History | Revalin",
};

export default async function OrdersPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const orders = await getOrdersForUser(session.user.id);

  return (
    <div className="space-y-6">
      <section className={`${accountPanelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
              Orders
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
              Order history
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`${accountInsetClass} px-4 py-3`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Total orders
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
                {orders.length}
              </p>
            </div>
            <div className={`${accountInsetClass} px-4 py-3`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Most recent
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#0B2E2F]">
                {orders[0]
                  ? formatAccountDate(orders[0].createdAt)
                  : "No orders yet"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {orders.length === 0 ? (
        <div
          className={`${accountPanelClass} border border-dashed border-[#0B2E2F]/15 px-6 py-14 text-center`}
        >
          <div className={`mx-auto size-14 ${accountIconFrameClass}`}>
            <Package2 className="size-6 text-[#0B2E2F]" />
          </div>
          <p className="mt-4 text-xl font-semibold tracking-tight text-[#0B2E2F]">
            No orders yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/58">
            Order history cards will show payment state, product titles, and
            quick links back to your live order pages.
          </p>
          <Button
            asChild
            className={`mt-5 h-11 px-5 text-sm font-semibold ${accountPrimaryButtonClass}`}
          >
            <Link href="/shop">
              Browse products
              <ShoppingBag className="size-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const totals = order.totals as any;
            const payment = order.payment as any;
            const lines = order.lines as any[];
            const shipping = order.shippingAddress as any;
            const itemCount = getOrderItemCount(lines);

            return (
              <Link
                key={order.orderId}
                href={`/order/${order.orderId}?key=${order.accessKey}`}
                className={`group block ${accountPanelClass} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B2E2F]/18 hover:shadow-[0_24px_80px_rgba(11,46,47,0.1)]`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`${accountStatusChipClass} ${getOrderStatusClasses(payment?.status)}`}
                      >
                        {getOrderStatusLabel(payment?.status)}
                      </span>
                      <span className="text-xs text-foreground/45">
                        Reference {order.orderId}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div>
                        <p className="text-xl font-semibold tracking-tight text-[#0B2E2F]">
                          {lines[0]?.productTitle || "Order details"}
                        </p>
                        <p className="mt-1 text-sm text-foreground/58">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                          {lines.length > 1
                            ? ` across ${lines.length} line items`
                            : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lines.slice(0, 3).map((line) => (
                            <span key={line.id} className={accountChipClass}>
                              {line.productTitle}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm text-foreground/58 sm:grid-cols-2 lg:grid-cols-1">
                        <div
                          className={`flex items-center gap-2 ${accountInsetClass} px-3.5 py-3`}
                        >
                          <CalendarDays className="size-4 text-[#0B2E2F]" />
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                              Ordered
                            </p>
                            <p className="mt-1 font-semibold text-[#0B2E2F]">
                              {formatAccountDate(order.createdAt)}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`flex items-center gap-2 ${accountInsetClass} px-3.5 py-3`}
                        >
                          <MapPin className="size-4 text-[#0B2E2F]" />
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                              Shipping
                            </p>
                            <p className="mt-1 font-semibold text-[#0B2E2F]">
                              {shipping?.city
                                ? `${shipping.city}, ${shipping.country}`
                                : "Address on file"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-2xl font-semibold tracking-tight text-[#0B2E2F]">
                      {formatPrice(
                        totals?.totalAmount?.amount || "0",
                        order.currencyCode,
                      )}
                    </p>
                    <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0B2E2F]">
                      Open order page
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
