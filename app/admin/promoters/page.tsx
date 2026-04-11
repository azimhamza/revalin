import { listPromoterInvites, listPromoters } from "@/lib/checkout/promoter-service";

import { PromoterManagement } from "./promoter-management";

export const metadata = {
  title: "Promoter Management | Revalin Admin",
};

type PromotersPageProps = {
  searchParams?: Promise<{
    openUser?: string | string[] | undefined;
    openPromoter?: string | string[] | undefined;
  }>;
};

export default async function PromotersPage({ searchParams }: PromotersPageProps) {
  const params = (await searchParams) || {};
  const requestedUserId = Array.isArray(params.openUser)
    ? params.openUser[0]
    : params.openUser;
  const requestedPromoterId = Array.isArray(params.openPromoter)
    ? params.openPromoter[0]
    : params.openPromoter;
  const [promoters, invites] = await Promise.all([
    listPromoters(),
    listPromoterInvites(),
  ]);

  return (
    <PromoterManagement
      promoters={promoters}
      invites={invites}
      initialOpenUserId={requestedUserId ?? null}
      initialOpenPromoterId={requestedPromoterId ?? null}
    />
  );
}
