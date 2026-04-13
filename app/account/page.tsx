import { getServerSession } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  MapPin,
  Megaphone,
  Shield,
  ShoppingBag,
  User as UserIcon,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AccountSignOut } from "./account-sign-out";
import { getOrdersForUser } from "@/lib/checkout/order-queries";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import {
  getPromoterByUserIdentity,
  recordPromoterApplicationFromReferralCode,
  resolveApprovedPromoterReferralCode,
} from "@/lib/checkout/promoter-service";
import { getFirstName } from "@/lib/checkout/promoter-referral-logic";
import { formatPrice } from "@/lib/swell/utils";
import {
  accountChipClass,
  accountDarkButtonClass,
  accountDarkPanelClass,
  accountIconTileClass,
  accountInsetClass,
  accountMutedPanelClass,
  accountPanelClass,
  accountPrimaryButtonClass,
  accountSecondaryButtonClass,
  accountStatusChipClass,
} from "./account-theme";
import { PromoterBoostDialog } from "./promoter-boost-dialog";
import {
  formatAccountDate,
  formatPaymentCurrencyLabel,
  getOrderItemCount,
  getOrderStatusClasses,
  getOrderStatusLabel,
  maskWalletAddress,
  parseAccountCryptoPreferences,
  parseAccountShippingAddress,
} from "./account-utils";

export const metadata = {
  title: "Account | Revalin",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ promoter_boost?: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const { user } = session;
  const params = (await searchParams) || {};
  const promoterBoostCode = params.promoter_boost?.trim() || null;
  const role = (user as any).role;
  const savedAddress = parseAccountShippingAddress(
    (user as any).shippingAddress,
  );
  const savedCryptoPreferences = parseAccountCryptoPreferences({
    preferredPaymentCurrency: (user as any).preferredPaymentCurrency,
    cryptoWalletAddress: (user as any).cryptoWalletAddress,
  });
  const [orders, affiliateRecord, promoterRecord] = await Promise.all([
    getOrdersForUser(user.id),
    getAffiliateByUserIdentity({
      userId: user.id,
      email: user.email,
    }),
    getPromoterByUserIdentity({
      userId: user.id,
      email: user.email,
    }),
  ]);
  const recentOrders = orders.slice(0, 3);
  const latestOrder = orders[0];
  const totalUnits = orders.reduce(
    (sum, order) => sum + getOrderItemCount(order.lines as any[]),
    0,
  );
  let promoterBoostFirstName: string | null = null;
  if (
    promoterBoostCode &&
    affiliateRecord &&
    affiliateRecord.status !== "approved" &&
    affiliateRecord.status !== "rejected"
  ) {
    try {
      const boostResult = await recordPromoterApplicationFromReferralCode({
        referralCode: promoterBoostCode,
        affiliateId: affiliateRecord.id,
        applicantName: user.name,
        applicantEmail: user.email.toLowerCase(),
        socialProfiles: affiliateRecord.socialProfiles,
      });
      if (boostResult.linked) {
        const boostResolution = await resolveApprovedPromoterReferralCode(promoterBoostCode);
        promoterBoostFirstName = getFirstName(boostResolution?.promoter.name);
      }
    } catch (error) {
      console.error("[PROMOTER-BOOST-ACCOUNT]", error);
    }
  }

  const showGrowthPartnerPanel =
    role === "affiliate" ||
    role === "admin" ||
    affiliateRecord?.status === "approved";
  const showGrowthPartnerCta = role !== "admin" && !showGrowthPartnerPanel;
  const showPromoterPanel =
    promoterRecord?.status === "approved" || role === "admin";
  const showPromoterCta =
    role !== "admin" && !showPromoterPanel && !promoterRecord;

  return (
    <div className="space-y-6">
      {promoterBoostFirstName ? (
        <PromoterBoostDialog promoterFirstName={promoterBoostFirstName} />
      ) : null}
      <section className="grid gap-4 md:grid-cols-3">
        <div className={`${accountPanelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
            Orders placed
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
            {orders.length}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/58">
            {orders.length > 0
              ? `${totalUnits} units ordered across your recent account history.`
              : "No orders yet. Start with the current catalog when you are ready."}
          </p>
        </div>

        <div className={`${accountPanelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
            Saved shipping
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#0B2E2F]">
            {savedAddress ? "Ready to use" : "Needs setup"}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/58">
            {savedAddress
              ? `${savedAddress.city}, ${savedAddress.country}`
              : "Add your shipping address once so checkout is faster next time."}
          </p>
        </div>

        <div className={`${accountDarkPanelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/55">
            Latest activity
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
            {latestOrder
              ? formatAccountDate(latestOrder.createdAt)
              : "No order activity"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#F4F1EA]/72">
            {latestOrder
              ? `Most recent order total: ${formatPrice((latestOrder.totals as any)?.totalAmount?.amount || "0", latestOrder.currencyCode)}.`
              : "Order updates and tracking links will appear here after your first purchase."}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <div className={`${accountPanelClass} p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 border-b border-[#0B2E2F]/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                Recent Orders
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
                Recent orders
              </h2>
            </div>
            <Button
              asChild
              variant="outline"
              className={`h-11 px-5 text-sm font-semibold ${accountSecondaryButtonClass}`}
            >
              <Link href="/account/orders">
                Full history
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {recentOrders.length === 0 ? (
            <div
              className={`${accountMutedPanelClass} mt-5 border border-dashed border-[#0B2E2F]/15 px-6 py-10 text-center`}
            >
              <p className="text-lg font-semibold tracking-tight text-[#0B2E2F]">
                No order history yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/58">
                Once you place an order, this dashboard will give you a clean
                timeline of payments, line items, and tracking links.
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
            <div className="mt-5 space-y-3">
              {recentOrders.map((order) => {
                const lines = order.lines as any[];
                const payment = order.payment as any;
                const itemCount = getOrderItemCount(lines);

                return (
                  <Link
                    key={order.orderId}
                    href={`/order/${order.orderId}?key=${order.accessKey}`}
                    className={`group block ${accountInsetClass} p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B2E2F]/18 hover:bg-white hover:shadow-[0_18px_50px_rgba(11,46,47,0.08)]`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`${accountStatusChipClass} ${getOrderStatusClasses(payment?.status)}`}
                          >
                            {getOrderStatusLabel(payment?.status)}
                          </span>
                          <span className="text-xs text-foreground/45">
                            {formatAccountDate(order.createdAt)}
                          </span>
                        </div>
                        <p className="mt-3 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                          Order {order.orderId}
                        </p>
                        <p className="mt-1 text-sm text-foreground/58">
                          {itemCount} {itemCount === 1 ? "item" : "items"} in
                          this order
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lines.slice(0, 3).map((line) => (
                            <span key={line.id} className={accountChipClass}>
                              {line.productTitle}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <p className="text-xl font-semibold tracking-tight text-[#0B2E2F]">
                          {formatPrice(
                            (order.totals as any)?.totalAmount?.amount || "0",
                            order.currencyCode,
                          )}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#0B2E2F]">
                          View order
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

        <div className="space-y-4">
          <section className={`${accountPanelClass} p-5 sm:p-6`}>
            <div className="flex items-center gap-3">
              <div className={accountIconTileClass}>
                <UserIcon className="size-5 text-[#0B2E2F]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                  Profile
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                  Account identity
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className={`${accountInsetClass} px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                  Name
                </p>
                <p className="mt-1 font-semibold text-[#0B2E2F]">{user.name}</p>
              </div>
              <div className={`${accountInsetClass} px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                  Email
                </p>
                <p className="mt-1 font-semibold text-[#0B2E2F]">
                  {user.email}
                </p>
              </div>
              {role && role !== "customer" ? (
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Role
                  </p>
                  <p className="mt-1 font-semibold capitalize text-[#0B2E2F]">
                    {role}
                  </p>
                </div>
              ) : null}
              <div className={`${accountInsetClass} px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                  Preferred crypto
                </p>
                <p className="mt-1 font-semibold text-[#0B2E2F]">
                  {formatPaymentCurrencyLabel(
                    savedCryptoPreferences.preferredPaymentCurrency,
                  )}
                </p>
              </div>
              <div className={`${accountInsetClass} px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                  Remembered wallet
                </p>
                <p className="mt-1 font-semibold text-[#0B2E2F]">
                  {maskWalletAddress(
                    savedCryptoPreferences.cryptoWalletAddress,
                  )}
                </p>
              </div>
            </div>

            <Button
              asChild
              variant="outline"
              className={`mt-5 h-11 w-full text-sm font-semibold ${accountSecondaryButtonClass}`}
            >
              <Link href="/account/profile">Edit profile</Link>
            </Button>
          </section>

          {role === "admin" ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Shield className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Admin
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Connected admin panel
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Access level
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    Administrator
                  </p>
                </div>
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Admin tools
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    Users, Growth Partners, payouts, and site analytics
                  </p>
                </div>
              </div>

              <Button
                asChild
                className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
              >
                <Link href="/admin">
                  Open admin panel
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ) : null}

          {showGrowthPartnerPanel ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Users className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Growth Partner
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Connected Growth Partner dashboard
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Referral code
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    {affiliateRecord?.code || "Not linked yet"}
                  </p>
                </div>
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Status
                  </p>
                  <p className="mt-1 font-semibold capitalize text-[#0B2E2F]">
                    {affiliateRecord?.status || "Needs review"}
                  </p>
                </div>
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Discount code
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    {affiliateRecord?.discountCode ||
                      "Assigned in Growth Partner dashboard"}
                  </p>
                </div>
              </div>

              {!affiliateRecord ? (
                <p className="mt-4 text-sm leading-6 text-foreground/58">
                  Your account is marked as a Growth Partner, but no Growth
                  Partner record is linked yet. Open the dashboard to verify
                  setup or contact support.
                </p>
              ) : null}

              <Button
                asChild
                className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
              >
                <Link
                  href={
                    affiliateRecord
                      ? "/affiliate/dashboard"
                      : "/affiliate/signup"
                  }
                >
                  {affiliateRecord
                    ? "Open Growth Partner dashboard"
                    : "Complete Growth Partner setup"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ) : showGrowthPartnerCta ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Users className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Growth Partner
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Become a Growth Partner
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-foreground/58">
                Apply to get a referral code, partner dashboard access, and
                commission payouts once the team approves your account.
              </p>

              <Button
                asChild
                className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
              >
                <Link href="/affiliate/signup">
                  Become a Growth Partner
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ) : null}

          {showPromoterPanel ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Megaphone className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Promoter
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Connected Promoter dashboard
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Referral code
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    {promoterRecord?.code || "Not assigned yet"}
                  </p>
                </div>
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Status
                  </p>
                  <p className="mt-1 font-semibold capitalize text-[#0B2E2F]">
                    {promoterRecord?.status || "Needs review"}
                  </p>
                </div>
                <div className={`${accountInsetClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                    Default commission
                  </p>
                  <p className="mt-1 font-semibold text-[#0B2E2F]">
                    {promoterRecord?.defaultCommissionRate
                      ? `${(Number(promoterRecord.defaultCommissionRate) * 100).toFixed(1)}%`
                      : "Assigned on approval"}
                  </p>
                </div>
              </div>

              <Button
                asChild
                className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
              >
                <Link href="/promoter/dashboard">
                  Open Promoter dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ) : showPromoterCta ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Megaphone className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Promoter
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Become a Promoter
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-foreground/58">
                Apply to recruit Growth Partners and earn commission on
                every order they generate. Get a referral link and
                promoter dashboard once the team approves your account.
              </p>

              <Button
                asChild
                className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
              >
                <Link href="/promoter/signup">
                  Become a Promoter
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </section>
          ) : promoterRecord ? (
            <section className={`${accountPanelClass} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className={accountIconTileClass}>
                  <Megaphone className="size-5 text-[#0B2E2F]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                    Promoter
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                    Application under review
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-foreground/58">
                Your promoter application is currently{" "}
                <span className="font-semibold capitalize">{promoterRecord.status}</span>.
                The team will review it and follow up by email.
              </p>
            </section>
          ) : null}

          <section className={`${accountPanelClass} p-5 sm:p-6`}>
            <div className="flex items-center gap-3">
              <div className={accountIconTileClass}>
                <MapPin className="size-5 text-[#0B2E2F]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                  Shipping
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                  Default address
                </h2>
              </div>
            </div>

            {savedAddress ? (
              <div
                className={`${accountInsetClass} mt-5 px-4 py-4 text-sm leading-6 text-[#0B2E2F]/70`}
              >
                <p className="font-semibold text-[#0B2E2F]">
                  {savedAddress.firstName} {savedAddress.lastName}
                </p>
                <p>{savedAddress.address1}</p>
                {savedAddress.address2 ? <p>{savedAddress.address2}</p> : null}
                <p>
                  {savedAddress.city}, {savedAddress.province}{" "}
                  {savedAddress.postalCode}
                </p>
                <p>{savedAddress.country}</p>
              </div>
            ) : (
              <div
                className={`${accountMutedPanelClass} mt-5 border border-dashed border-[#0B2E2F]/15 px-4 py-4`}
              >
                <p className="text-sm leading-6 text-foreground/58">
                  No address saved yet. Add it once so checkout and shipping
                  confirmations are much cleaner.
                </p>
              </div>
            )}

            <Button
              asChild
              className={`mt-5 h-11 w-full text-sm font-semibold ${accountPrimaryButtonClass}`}
            >
              <Link href="/account/profile">
                {savedAddress ? "Update address" : "Add address"}
              </Link>
            </Button>
          </section>

          <section className={`${accountDarkPanelClass} p-5 sm:p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/55">
              Session
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-[#F4F1EA]">
              Signed in securely
            </p>
            <p className="mt-2 text-sm leading-6 text-[#F4F1EA]/72">
              Use this area to manage your account. Sign out here when you are
              finished on a shared device.
            </p>
            <AccountSignOut
              className={`mt-4 h-11 w-full text-sm font-semibold ${accountDarkButtonClass}`}
            />
          </section>
        </div>
      </section>
    </div>
  );
}
