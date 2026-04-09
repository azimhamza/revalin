"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
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
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
} from "../_components/admin-shell";

type CommissionTierRow = {
  id?: string;
  key: string;
  label: string;
  minRevenue: string;
  maxRevenue: string | null;
  rate: string;
  sortOrder: number;
  active: boolean;
};

function makeNewTier(sortOrder: number): CommissionTierRow {
  return {
    key: `tier_${sortOrder + 1}`,
    label: `Tier ${sortOrder + 1}`,
    minRevenue: "0.00",
    maxRevenue: null,
    rate: "0.10",
    sortOrder,
    active: true,
  };
}

export function CommissionTierManagement({
  initialTiers,
}: {
  initialTiers: CommissionTierRow[];
}) {
  const [tiers, setTiers] = useState(initialTiers);
  const [loading, setLoading] = useState(false);

  function updateTier(
    index: number,
    patch: Partial<CommissionTierRow>,
  ) {
    setTiers((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...patch } : tier,
      ),
    );
  }

  function addTier() {
    setTiers((current) => [
      ...current.map((tier, index) => ({ ...tier, sortOrder: index })),
      makeNewTier(current.length),
    ]);
  }

  function removeTier(index: number) {
    setTiers((current) =>
      current
        .filter((_, tierIndex) => tierIndex !== index)
        .map((tier, tierIndex) => ({ ...tier, sortOrder: tierIndex })),
    );
  }

  async function saveTiers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/affiliate-commission-tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiers: tiers.map((tier, index) => ({
            ...tier,
            sortOrder: index,
            maxRevenue:
              tier.maxRevenue === null || !tier.maxRevenue.trim()
                ? null
                : tier.maxRevenue.trim(),
          })),
        }),
      });

      const payload = await readJsonSafely(response);
      const data =
        getApiData<{
          tiers?: CommissionTierRow[];
        }>(payload) ??
        (payload as {
          tiers?: CommissionTierRow[];
        });
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to save commission tiers."));
      }

      setTiers(
        (data.tiers as CommissionTierRow[]).map((tier, index) => ({
          ...tier,
          sortOrder: index,
        })),
      );
    } catch (error) {
      console.error("[ADMIN-COMMISSION-TIERS-SAVE]", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminPanel className="space-y-3">
      <AdminSectionHeader
        eyebrow="Commission tiers"
        title="Global tier configuration"
        description="These monthly revenue bands determine the effective commission floor for every Growth Partner. Keep the ranges continuous from $0 upward."
        action={
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={addTier}
              className={adminSecondaryButtonClass}
            >
              <Plus className="mr-2 size-3.5" />
              Add tier
            </Button>
            <Button
              type="button"
              onClick={saveTiers}
              disabled={loading}
              className={adminPrimaryButtonClass}
            >
              {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
              Save tiers
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden border border-border/70 bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Min revenue</TableHead>
              <TableHead>Max revenue</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((tier, index) => (
              <TableRow key={tier.id || `${tier.key}-${index}`}>
                <TableCell>
                  <Input
                    value={tier.key}
                    onChange={(event) =>
                      updateTier(index, { key: event.target.value })
                    }
                    className={adminFieldClass}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={tier.label}
                    onChange={(event) =>
                      updateTier(index, { label: event.target.value })
                    }
                    className={adminFieldClass}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={tier.minRevenue}
                    onChange={(event) =>
                      updateTier(index, { minRevenue: event.target.value })
                    }
                    className={adminFieldClass}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={tier.maxRevenue ?? ""}
                    onChange={(event) =>
                      updateTier(index, { maxRevenue: event.target.value || null })
                    }
                    placeholder="Leave blank for final tier"
                    className={adminFieldClass}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={tier.rate}
                    onChange={(event) =>
                      updateTier(index, { rate: event.target.value })
                    }
                    className={adminFieldClass}
                  />
                </TableCell>
                <TableCell>
                  <label className="inline-flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={tier.active}
                      onChange={(event) =>
                        updateTier(index, { active: event.target.checked })
                      }
                    />
                    {tier.active ? "Yes" : "No"}
                  </label>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-none"
                    disabled={tiers.length === 1}
                    onClick={() => removeTier(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminPanel>
  );
}
