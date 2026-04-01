import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { PageLayout } from "@/components/layout/page-layout";
import Link from "next/link";

import { AdminNav } from "./_components/admin-nav";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isTemporarilyHiddenAppRoute("/admin")) {
    notFound();
  }

  const session = await getServerSession();

  if (!session?.user || (session.user as any).role !== "admin") {
    redirect("/login?callbackUrl=/admin");
  }

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-16">
        <div className="mx-auto max-w-[1480px]">
          <div className="overflow-hidden border border-[#0B2E2F]/12 bg-[#F1EADB] shadow-[0_24px_80px_rgba(11,46,47,0.08)]">
            <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="border-b border-[#0B2E2F]/12 bg-[#E6DECF] lg:border-b-0 lg:border-r">
                <div className="space-y-6 p-5 md:p-6">
                  <h1 className="text-[2rem] font-semibold tracking-[-0.06em] text-[#0B2E2F]">
                    Revalin Dashboard
                  </h1>

                  <AdminNav />
                </div>
              </aside>

              <div className="min-w-0">
                <header className="border-b border-[#0B2E2F]/12 bg-[linear-gradient(135deg,#f7f4ec_0%,#efe7d8_100%)] px-5 py-5 md:px-8 md:py-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <h2 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[#0B2E2F]">
                      Operations
                    </h2>

                    <Link
                      href="/account"
                      className="inline-flex h-11 items-center justify-center border border-[#0B2E2F]/14 bg-[#FCFAF6] px-5 text-sm font-semibold text-[#0B2E2F] transition-colors hover:bg-[#F1EADB]"
                    >
                      Back to account
                    </Link>
                  </div>
                </header>

                <main className="bg-[linear-gradient(180deg,#f4f1ea_0%,#efe7d8_100%)] p-5 md:p-8">
                  {children}
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
