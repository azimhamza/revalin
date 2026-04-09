"use client";

import { useState } from "react";

import { Loader2, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
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
};

type UserFilter = "all" | "customer" | "affiliate" | "admin" | "banned";

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
      : "Convert to Growth Partner";
  }
  if (entry.affiliate.status === "approved") return "Manage Growth Partner";
  return "Open Growth Partner setup";
}

function sanitizePartnerCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSuggestedPartnerCode(entry: Pick<UserRow, "name" | "email">) {
  const candidate =
    sanitizePartnerCode(entry.name || "") ||
    sanitizePartnerCode(entry.email.split("@")[0] || "");

  return candidate.length >= 3 ? candidate : "partner";
}

export function UserManagement({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");

  async function handleOpenAffiliateSetup(entry: UserRow) {
    if (entry.affiliate) {
      router.push(`/admin/affiliates?openAffiliate=${entry.affiliate.id}`);
      return;
    }

    const suggestedCode = buildSuggestedPartnerCode(entry);

    setLoadingId(entry.id);
    try {
      const res = await fetch(`/api/admin/users/${entry.id}/affiliate-assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliateCode: suggestedCode }),
      });

      const payload = await readJsonSafely(res);
      const data =
        getApiData<{
          setup?: {
            affiliate?: {
              id: string;
            };
          };
        }>(payload) ??
        (payload as {
          setup?: {
            affiliate?: {
              id: string;
            };
          };
        });
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to prepare Growth Partner setup."));
      }

      const affiliateId = data?.setup?.affiliate?.id;
      if (!affiliateId) {
        throw new Error("Growth Partner setup is missing an affiliate record.");
      }

      router.push(`/admin/affiliates?openAffiliate=${affiliateId}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to prepare Growth Partner setup.";

      console.error("Failed to prepare Growth Partner setup:", error);
      window.alert(message);
    } finally {
      setLoadingId(null);
    }
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

  const counts = {
    all: users.length,
    customer: users.filter((entry) => (entry.role ?? "customer") === "customer")
      .length,
    affiliate: users.filter((entry) => entry.role === "affiliate").length,
    admin: users.filter((entry) => entry.role === "admin").length,
    banned: users.filter((entry) => Boolean(entry.banned)).length,
  };

  const filteredUsers = users.filter((entry) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "banned"
          ? Boolean(entry.banned)
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
    { key: "admin", label: "Admins", count: counts.admin },
    { key: "banned", label: "Banned", count: counts.banned },
  ];

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="User management"
        description="Start Growth Partner setup from the roster, then finish code assignment in the affiliate approval flow so partner codes, Swell coupons, and account roles stay in sync."
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
                  <Badge
                    variant={roleBadgeVariant(entry.role)}
                    className="capitalize"
                  >
                    {formatRoleLabel(entry.role)}
                  </Badge>
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
                      {entry.role !== "admin" ? (
                        <DropdownMenuItem
                          onClick={() => handleOpenAffiliateSetup(entry)}
                          className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                        >
                          {getAffiliateActionLabel(entry)}
                        </DropdownMenuItem>
                      ) : null}
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
