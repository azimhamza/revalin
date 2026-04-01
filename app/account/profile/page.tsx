import { getServerSession } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";
import { accountPanelClass } from "../account-theme";
import {
  parseAccountShippingAddress,
  parseAccountCryptoPreferences,
} from "../account-utils";

export const metadata = {
  title: "Edit Profile | Revalin",
};

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const savedAddress = parseAccountShippingAddress(
    (session.user as any).shippingAddress,
  );
  const savedCryptoPreferences = parseAccountCryptoPreferences({
    preferredPaymentCurrency: (session.user as any).preferredPaymentCurrency,
    cryptoWalletAddress: (session.user as any).cryptoWalletAddress,
  });

  return (
    <div className="space-y-4">
      <section className={`${accountPanelClass} p-5 sm:p-6`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
          Profile
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
          Profile details
        </h2>
      </section>

      <ProfileForm
        userName={session.user.name}
        userEmail={session.user.email}
        savedAddress={savedAddress}
        savedCryptoPreferences={savedCryptoPreferences}
      />
    </div>
  );
}
