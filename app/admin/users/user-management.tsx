"use client";

import { useState } from "react";

import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  adminFieldClass,
  AdminFilterTabs,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: Date;
  affiliate: {
    id: string;
    code: string;
    status: "pending" | "approved" | "rejected" | "suspended";
    userId: string | null;
  } | null;
  promoter: {
    id: string;
    status: "pending" | "approved" | "rejected" | "suspended";
    userId: string | null;
  } | null;
};

type UserFilter = "all" | "customer" | "affiliate" | "promoter" | "admin" | "banned";

const ROLES = ["customer", "admin"] as const;

function roleBadgeVariant(
  role: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (role === "admin") return "destructive";
  if (role === "affiliate") return "default";
  return "outline";
}

function formatRoleLabel(role: string | null) {
  if (role === "affiliate") return "Growth Partner";
  if (role === "admin") return "Admin";
  return role || "customer";
}

function getAffiliateActionLabel(entry: UserRow) {
  if (!entry.affiliate) {
    return entry.role === "affiliate"
      ? "Open Growth Partner setup"
      : "Enable Growth Partner access";
  }
  if (entry.affiliate.status === "approved") return "Manage Growth Partner";
  return "Open Growth Partner setup";
}

function hasGrowthPartnerRecord(entry: UserRow) {
  return entry.role === "affiliate" || Boolean(entry.affiliate);
}

function hasPromoterRecord(entry: UserRow) {
  return Boolean(entry.promoter);
}

export function UserManagement({
  users,
  canDeleteUsers = false,
}: {
  users: UserRow[];
  canDeleteUsers?: boolean;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");

  async function handleOpenAffiliateSetup(entry: UserRow) {
    if (entry.affiliate) {
      router.push(`/admin/affiliates?openAffiliate=${entry.affiliate.id}`);
      return;
    }

    router.push(`/admin/affiliates?openUser=${entry.id}`);
  }

  async function handleOpenPromoterSetup(entry: UserRow) {
    if (entry.promoter) {
      router.push(`/admin/promoters?openPromoter=${entry.promoter.id}`);
      return;
    }

    router.push(`/admin/promoters?openUser=${entry.id}`);
  }

  async function handleSetRole(userId: string, role: string) {
    setLoadingId(userId);
    try {
      await authClient.admin.setRole({ userId, role: role as any });
      router.refresh();
    } catch (err) {
      console.error("Failed to set role:", err);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleBan(userId: string) {
    setLoadingId(userId);
    try {
      await authClient.admin.banUser({ userId });
      router.refresh();
    } catch (err) {
      console.error("Failed to ban user:", err);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleUnban(userId: string) {
    setLoadingId(userId);
    try {
      await authClient.admin.unbanUser({ userId });
      router.refresh();
    } catch (err) {
      console.error("Failed to unban user:", err);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDeleteUser(entry: UserRow) {
    const confirmed = window.confirm(
      `Permanently delete ${entry.email}?\n\nThis will remove the user, linked Growth Partner and Promoter records, related payout rows, Swell coupon assignments, and the Loops contact. This action cannot be undone.`,
    );
    if (!confirmed) return;

    setLoadingId(entry.id);
    try {
      const response = await fetch(`/api/admin/users/${entry.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload?.error?.message ||
          `Failed to delete user (${response.status}).`;
        throw new Error(message);
      }

      const warnings: string[] = [];

      const swell = payload?.data?.swell;
      if (swell && Array.isArray(swell.errors) && swell.errors.length > 0) {
        warnings.push(
          `Swell coupon cleanup failed for ${swell.errors.length} of ${swell.attempted}: ${swell.errors
            .map((e: { couponId: string; message: string }) => `${e.couponId} (${e.message})`)
            .join(", ")}`,
        );
      }

      const loops = payload?.data?.loops;
      if (loops && loops.success === false && !loops.skipped) {
        warnings.push(
          `Loops cleanup failed: ${loops.error ?? "unknown error"}`,
        );
      }

      if (warnings.length > 0) {
        window.alert(`User deleted, but:\n\n${warnings.join("\n\n")}`);
      }

      router.refresh();
    } catch (err) {
      console.error("Failed to delete user:", err);
      window.alert(
        err instanceof Error ? err.message : "Failed to delete user.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  const counts = {
    all: users.length,
    customer: users.filter((entry) => (entry.role ?? "customer") === "customer")
      .length,
    affiliate: users.filter((entry) => hasGrowthPartnerRecord(entry)).length,
    promoter: users.filter((entry) => hasPromoterRecord(entry)).length,
    admin: users.filter((entry) => entry.role === "admin").length,
    banned: users.filter((entry) => Boolean(entry.banned)).length,
  };

  const filteredUsers = users.filter((entry) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "banned"
          ? Boolean(entry.banned)
        : filter === "affiliate"
            ? hasGrowthPartnerRecord(entry)
          : filter === "promoter"
            ? hasPromoterRecord(entry)
            : (entry.role ?? "customer") === filter;

    if (!matchesFilter) return false;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return (
      entry.name.toLowerCase().includes(normalizedQuery) ||
      entry.email.toLowerCase().includes(normalizedQuery) ||
      entry.id.toLowerCase().includes(normalizedQuery)
    );
  });

  const filterOptions: { key: UserFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "customer", label: "Customers", count: counts.customer },
    { key: "affiliate", label: "Growth Partners", count: counts.affiliate },
    { key: "promoter", label: "Promoters", count: counts.promoter },
    { key: "admin", label: "Admins", count: counts.admin },
    { key: "banned", label: "Banned", count: counts.banned },
  ];

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="User management"
        description="Start Growth Partner setup from the roster, including for admins who should keep admin access while also getting linked partner codes, discounts, and commission settings."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminStatCard label="Accounts" value={counts.all} size="compact" />
        <AdminStatCard label="Customers" value={counts.customer} size="compact" />
        <AdminStatCard
          label="Growth Partners"
          value={counts.affiliate}
          size="compact"
        />
        <AdminStatCard
          label="Restricted"
          value={counts.banned}
          tone="muted"
          size="compact"
        />
      </div>

      <AdminPanel className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 xl:w-full xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, or user ID"
              className={adminFieldClass}
            />

            <AdminFilterTabs
              options={filterOptions}
              value={filter}
              onChange={setFilter}
            />
          </div>

          <div className="shrink-0 text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {filteredUsers.length}
            </span>{" "}
            of {users.length}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-2.5 md:flex-row md:items-end md:justify-between">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Account roster
          </h3>
        </div>

        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="border-b-border hover:bg-transparent">
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                User
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Role
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Joined
              </TableHead>
              <TableHead className="w-12 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-b-border bg-background transition-colors hover:bg-muted/40"
              >
                <TableCell className="px-3 py-2.5 align-top">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.name || "Unnamed user"}
                    </p>
                    <p className="text-xs text-muted-foreground">{entry.email}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80">
                      {entry.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant={roleBadgeVariant(entry.role)}
                      className="capitalize"
                    >
                      {formatRoleLabel(entry.role)}
                    </Badge>
                    {entry.affiliate && entry.role !== "affiliate" ? (
                      <Badge variant="default">
                        Growth Partner
                      </Badge>
                    ) : null}
                    {entry.promoter ? (
                      <Badge variant="secondary">
                        Promoter
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  {entry.banned ? (
                    <Badge variant="destructive">
                      Banned
                    </Badge>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      Active
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={loadingId === entry.id}
                        className="h-7 w-7 rounded-none border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="rounded-none border-border bg-popover p-0.5"
                    >
                      <DropdownMenuItem
                        onClick={() => handleOpenAffiliateSetup(entry)}
                        className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                      >
                        {getAffiliateActionLabel(entry)}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenPromoterSetup(entry)}
                        className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                      >
                        {entry.promoter ? "Manage Promoter" : "Enable Promoter access"}
                      </DropdownMenuItem>
                      {entry.role !== "affiliate"
                        ? ROLES.filter((role) => role !== entry.role).map(
                            (role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => handleSetRole(entry.id, role)}
                                className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                              >
                                Set as {formatRoleLabel(role)}
                              </DropdownMenuItem>
                            ),
                          )
                        : null}
                      {entry.banned ? (
                        <DropdownMenuItem
                          onClick={() => handleUnban(entry.id)}
                          className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                        >
                          Unban user
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleBan(entry.id)}
                          className="rounded-none px-2.5 py-1.5 text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          Ban user
                        </DropdownMenuItem>
                      )}
                      {canDeleteUsers ? (
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(entry)}
                          className="rounded-none border-t border-border/60 px-2.5 py-1.5 text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 className="mr-1.5 size-3.5" />
                          Delete user (dev)
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}

            {filteredUsers.length === 0 ? (
              <TableRow className="border-b-0 bg-background hover:bg-background">
                <TableCell
                  colSpan={5}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  No users match the current search and filter combination.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
