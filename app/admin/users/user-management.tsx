"use client";

import { useState } from "react";

import { MoreHorizontal } from "lucide-react";
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
};

type UserFilter = "all" | "customer" | "affiliate" | "admin" | "banned";

const ROLES = ["customer", "affiliate", "admin"] as const;

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

export function UserManagement({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");

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
    <div className="space-y-6">
      <AdminSectionHeader title="User management" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Accounts" value={counts.all} />
        <AdminStatCard label="Customers" value={counts.customer} />
        <AdminStatCard label="Growth Partners" value={counts.affiliate} />
        <AdminStatCard label="Restricted" value={counts.banned} tone="muted" />
      </div>

      <AdminPanel className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 xl:w-full xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, or user ID"
              className={adminFieldClass}
            />

            <div className="grid gap-2 sm:grid-cols-5">
              {filterOptions.map((option) => {
                const active = filter === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    className={`flex h-10 items-center justify-between border px-3 text-left text-sm transition-colors ${
                      active
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F] hover:bg-[#F1EADB]"
                    }`}
                  >
                    <span className="font-semibold">{option.label}</span>
                    <span
                      className={`text-xs ${active ? "text-[#F4F1EA]/62" : "text-[#0B2E2F]/48"}`}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 text-sm text-[#0B2E2F]/56">
            Showing{" "}
            <span className="font-semibold text-[#0B2E2F]">
              {filteredUsers.length}
            </span>{" "}
            of {users.length}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-[#0B2E2F]/12 px-5 py-4 md:flex-row md:items-end md:justify-between">
          <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
            Account roster
          </h3>
        </div>

        <Table>
          <TableHeader className="bg-[#EFE7D8]">
            <TableRow className="border-b-[#0B2E2F]/10 hover:bg-transparent">
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                User
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Role
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Status
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Joined
              </TableHead>
              <TableHead className="w-16 px-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-b-[#0B2E2F]/10 bg-[#FCFAF6] transition-colors hover:bg-[#F1EADB]"
              >
                <TableCell className="px-5 py-4 align-top">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#0B2E2F]">
                      {entry.name || "Unnamed user"}
                    </p>
                    <p className="text-sm text-[#0B2E2F]/60">{entry.email}</p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#0B2E2F]/34">
                      {entry.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  <Badge
                    variant={roleBadgeVariant(entry.role)}
                    className="rounded-none capitalize"
                  >
                    {formatRoleLabel(entry.role)}
                  </Badge>
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  {entry.banned ? (
                    <Badge variant="destructive" className="rounded-none">
                      Banned
                    </Badge>
                  ) : (
                    <span className="text-sm font-medium text-[#0B2E2F]/56">
                      Active
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/56">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={loadingId === entry.id}
                        className="rounded-none border border-[#0B2E2F]/12 text-[#0B2E2F]/56 hover:bg-[#EFE7D8] hover:text-[#0B2E2F]"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="rounded-none border-[#0B2E2F]/14 bg-[#FCFAF6] p-1"
                    >
                      {ROLES.filter((role) => role !== entry.role).map(
                        (role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => handleSetRole(entry.id, role)}
                            className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                          >
                            Set as {formatRoleLabel(role)}
                          </DropdownMenuItem>
                        ),
                      )}
                      {entry.banned ? (
                        <DropdownMenuItem
                          onClick={() => handleUnban(entry.id)}
                          className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                        >
                          Unban user
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleBan(entry.id)}
                          className="rounded-none px-3 py-2 text-red-600 focus:bg-[#F6DDD8] focus:text-red-700"
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
              <TableRow className="border-b-0 bg-[#FCFAF6] hover:bg-[#FCFAF6]">
                <TableCell
                  colSpan={5}
                  className="px-5 py-10 text-center text-sm text-[#0B2E2F]/52"
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
