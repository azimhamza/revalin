"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  AdminFilterTabs,
  AdminPanel,
  AdminSectionHeader,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "../_components/admin-shell";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import type { ResearchPaperSummary } from "@/lib/research/queries";

type PaperStatus = ResearchPaperSummary["status"];
type Filter = "all" | PaperStatus;

type ResearchManagementProps = {
  initialPapers: ResearchPaperSummary[];
  peptides: Array<{ id: string; slug: string; name: string }>;
};

export function ResearchManagement({
  initialPapers,
  peptides,
}: ResearchManagementProps) {
  const router = useRouter();
  const [papers, setPapers] = useState(initialPapers);
  const [filter, setFilter] = useState<Filter>("all");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const base = {
      all: papers.length,
      draft: 0,
      published: 0,
      archived: 0,
    } as Record<Filter, number>;
    for (const p of papers) {
      base[p.status] += 1;
    }
    return base;
  }, [papers]);

  const visiblePapers = useMemo(() => {
    if (filter === "all") return papers;
    return papers.filter((p) => p.status === filter);
  }, [papers, filter]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this paper? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/research/papers/${id}`, {
        method: "DELETE",
      });
      const payload = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Delete failed (${res.status})`));
      }
      setPapers((current) => current.filter((p) => p.id !== id));
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <AdminPanel tone="inverse">
        <AdminSectionHeader
          eyebrow="Research"
          title="Research papers"
          description="Author, publish, and manage peptide research articles. All content is research-use only."
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/research/peptides"
                className={`${adminSecondaryButtonClass} shrink-0`}
              >
                Manage peptides
              </Link>
              <Link
                href="/admin/research/new"
                className={`${adminPrimaryButtonClass} shrink-0`}
              >
                <Plus className="size-3 shrink-0" />
                <span>New paper</span>
              </Link>
            </div>
          }
        />
      </AdminPanel>

      <AdminPanel>
        <div className="flex items-center justify-between gap-3 pb-3">
          <AdminFilterTabs<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { key: "all", label: "All", count: counts.all },
              { key: "published", label: "Published", count: counts.published },
              { key: "draft", label: "Draft", count: counts.draft },
              { key: "archived", label: "Archived", count: counts.archived },
            ]}
          />
          {isPending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {visiblePapers.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No papers to show. Create one with the "New paper" button above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Peptides</th>
                  <th className="py-2 pr-3">Topics</th>
                  <th className="py-2 pr-3">Reading</th>
                  <th className="py-2 pr-3">Published</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePapers.map((paper) => (
                  <tr
                    key={paper.id}
                    className="border-b border-border/60 align-top"
                  >
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-foreground">
                        {paper.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        /{paper.slug}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={paper.status} />
                    </td>
                    <td className="py-3 pr-3">
                      {paper.peptides.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {paper.peptides.map((p) => (
                            <span
                              key={p.id}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {paper.topics.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {paper.topics.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {paper.readingTimeMinutes} min
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {paper.publishedAt
                        ? new Date(paper.publishedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/research/papers/${paper.slug}?preview=1`}
                          target="_blank"
                          rel="noreferrer"
                          className={adminSecondaryButtonClass}
                          title="Preview on site"
                        >
                          <ExternalLink className="size-3" />
                        </Link>
                        <Link
                          href={`/admin/research/${paper.id}`}
                          className={adminSecondaryButtonClass}
                          title="Edit"
                        >
                          <Pencil className="size-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(paper.id)}
                          disabled={deletingId === paper.id}
                          className={adminSecondaryButtonClass}
                          title="Delete"
                        >
                          {deletingId === paper.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
          {peptides.length} peptide{peptides.length === 1 ? "" : "s"} in the
          library ·{" "}
          <Link
            href="/admin/research/peptides"
            className="underline hover:text-foreground"
          >
            manage peptides
          </Link>
        </div>
      </AdminPanel>
    </div>
  );
}

function StatusBadge({ status }: { status: PaperStatus }) {
  const map: Record<PaperStatus, { label: string; className: string }> = {
    published: {
      label: "Published",
      className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    },
    draft: {
      label: "Draft",
      className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    },
    archived: {
      label: "Archived",
      className: "bg-muted text-muted-foreground border-border",
    },
  };
  const style = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${style.className}`}
    >
      {style.label}
    </span>
  );
}
