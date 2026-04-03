import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AdminHeader } from "./_components/admin-header";
import { AdminSidebar } from "./_components/admin-sidebar";

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
    <div className="admin-theme min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(11,46,47,0.08),transparent_28%),linear-gradient(180deg,#f6f2e8_0%,#efe6d7_100%)] text-foreground">
      <SidebarProvider>
        <AdminSidebar />
        <SidebarInset className="min-h-screen bg-transparent">
          <AdminHeader />
          <main className="flex-1 px-2.5 py-3 sm:px-3.5 lg:px-4">
            <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-3">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
