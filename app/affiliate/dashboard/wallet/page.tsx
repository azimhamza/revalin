import { redirect } from "next/navigation";

export const metadata = {
  title: "Wallet Settings | Revalin Growth Partner",
};

export default function WalletPage() {
  redirect("/affiliate/dashboard#payout-settings");
}
