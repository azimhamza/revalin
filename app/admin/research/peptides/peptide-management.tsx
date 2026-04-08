"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminPanel,
  AdminSectionHeader,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "../../_components/admin-shell";
import { ImageUploader } from "../_components/image-uploader";
import { slugify } from "@/lib/research/slug";

type PeptideStatus = "draft" | "published" | "archived";

type PeptideRow = {
  id: string;
  slug: string;
  name: string;
  fullName: string | null;
  sequence: string | null;
  description: string | null;
  molecularWeight: string | null;
  cas: string | null;
  productSlug: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  tags: string[];
  sortOrder: number;
  status: PeptideStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  paperCount: number;
};

type PeptideManagementProps = {
  initialPeptides: PeptideRow[];
};

type FormState = {
  slug: string;
  name: string;
  fullName: string;
  sequence: string;
  description: string;
  molecularWeight: string;
  cas: string;
  productSlug: string;
  heroImageUrl: string | null;
  heroImageAlt: string;
  tags: string[];
  sortOrder: number;
  status: PeptideStatus;
  seoTitle: string;
  seoDescription: string;
};

function emptyForm(): FormState {
  return {
    slug: "",
    name: "",
    fullName: "",
    sequence: "",
    description: "",
    molecularWeight: "",
    cas: "",
    productSlug: "",
    heroImageUrl: null,
    heroImageAlt: "",
    tags: [],
    sortOrder: 0,
    status: "published",
    seoTitle: "",
    seoDescription: "",
  };
}

function peptideToForm(p: PeptideRow): FormState {
  return {
    slug: p.slug,
    name: p.name,
    fullName: p.fullName ?? "",
    sequence: p.sequence ?? "",
    description: p.description ?? "",
    molecularWeight: p.molecularWeight ?? "",
    cas: p.cas ?? "",
    productSlug: p.productSlug ?? "",
    heroImageUrl: p.heroImageUrl,
    heroImageAlt: p.heroImageAlt ?? "",
    tags: p.tags ?? [],
    sortOrder: p.sortOrder,
    status: p.status,
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
  };
}

export function PeptideManagement({
  initialPeptides,
}: PeptideManagementProps) {
  const router = useRouter();
  const [peptides, setPeptides] = useState(initialPeptides);
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setSlugTouched(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(peptide: PeptideRow) {
    setEditingId(peptide.id);
    setForm(peptideToForm(peptide));
    setSlugTouched(true);
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (saving) return;
    setOpen(false);
  }

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (form.tags.includes(trimmed)) return;
    update("tags", [...form.tags, trimmed]);
  }

  function removeTag(tag: string) {
    update(
      "tags",
      form.tags.filter((t) => t !== tag),
    );
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        fullName: form.fullName.trim() || undefined,
        sequence: form.sequence.trim() || undefined,
        description: form.description.trim() || undefined,
        molecularWeight: form.molecularWeight.trim() || undefined,
        cas: form.cas.trim() || undefined,
        productSlug: form.productSlug.trim() || undefined,
        heroImageUrl: form.heroImageUrl || undefined,
        heroImageAlt: form.heroImageAlt.trim() || undefined,
        tags: form.tags,
        sortOrder: form.sortOrder,
        status: form.status,
        seoTitle: form.seoTitle.trim() || undefined,
        seoDescription: form.seoDescription.trim() || undefined,
      };

      const url = editingId
        ? `/api/admin/research/peptides/${editingId}`
        : "/api/admin/research/peptides";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }

      const existingPaperCount = editingId
        ? (peptides.find((p) => p.id === editingId)?.paperCount ?? 0)
        : 0;

      const savedPeptide: PeptideRow = {
        id: data.peptide.id,
        slug: data.peptide.slug,
        name: data.peptide.name,
        fullName: data.peptide.fullName,
        sequence: data.peptide.sequence,
        description: data.peptide.description,
        molecularWeight: data.peptide.molecularWeight,
        cas: data.peptide.cas,
        productSlug: data.peptide.productSlug,
        heroImageUrl: data.peptide.heroImageUrl,
        heroImageAlt: data.peptide.heroImageAlt,
        tags: (data.peptide.tags as string[]) ?? [],
        sortOrder: data.peptide.sortOrder,
        status: data.peptide.status,
        seoTitle: data.peptide.seoTitle,
        seoDescription: data.peptide.seoDescription,
        paperCount: existingPaperCount,
      };

      setPeptides((current) => {
        if (editingId) {
          return current.map((p) =>
            p.id === editingId ? savedPeptide : p,
          );
        }
        return [...current, savedPeptide];
      });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(peptide: PeptideRow) {
    if (
      !confirm(
        peptide.paperCount > 0
          ? `This peptide has ${peptide.paperCount} linked paper(s). Delete anyway? Links will be removed but papers remain.`
          : "Delete this peptide? This cannot be undone.",
      )
    ) {
      return;
    }
    setDeletingId(peptide.id);
    try {
      const url = `/api/admin/research/peptides/${peptide.id}${peptide.paperCount > 0 ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Delete failed (${res.status})`);
      }
      setPeptides((current) => current.filter((p) => p.id !== peptide.id));
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const sortedPeptides = useMemo(
    () =>
      [...peptides].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [peptides],
  );

  const labelClass =
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

  return (
    <div className="space-y-3">
      <AdminPanel tone="inverse">
        <AdminSectionHeader
          eyebrow="Research"
          title="Peptide library"
          description="Manage the peptides shown on the research hub and linked to papers."
          action={
            <div className="flex gap-2">
              <Link
                href="/admin/research"
                className={adminSecondaryButtonClass}
              >
                Back to papers
              </Link>
              <button
                type="button"
                className={adminPrimaryButtonClass}
                onClick={openNew}
              >
                <Plus className="size-3" />
                New peptide
              </button>
            </div>
          }
        />
      </AdminPanel>

      <AdminPanel>
        {isPending ? (
          <div className="pb-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {sortedPeptides.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No peptides yet. Create one to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Slug</th>
                  <th className="py-2 pr-3">Tags</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Papers</th>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPeptides.map((peptide) => (
                  <tr
                    key={peptide.id}
                    className="border-b border-border/60 align-top"
                  >
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-foreground">
                        {peptide.name}
                      </div>
                      {peptide.fullName ? (
                        <div className="text-[10px] text-muted-foreground">
                          {peptide.fullName}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 font-mono text-[10px] text-muted-foreground">
                      /{peptide.slug}
                    </td>
                    <td className="py-3 pr-3">
                      {peptide.tags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {peptide.tags.map((t) => (
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
                      {peptide.status}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {peptide.paperCount}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {peptide.sortOrder}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className={adminSecondaryButtonClass}
                          onClick={() => openEdit(peptide)}
                          title="Edit"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          className={adminSecondaryButtonClass}
                          onClick={() => handleDelete(peptide)}
                          disabled={deletingId === peptide.id}
                          title="Delete"
                        >
                          {deletingId === peptide.id ? (
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
      </AdminPanel>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit peptide" : "New peptide"}
            </DialogTitle>
            <DialogDescription>
              Peptides appear on the research hub and can be linked from papers.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : null}

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className={labelClass}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    update("name", e.target.value);
                    if (!slugTouched && !editingId) {
                      update("slug", slugify(e.target.value));
                    }
                  }}
                  placeholder="BPC-157"
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>

              <div className="space-y-1">
                <label className={labelClass}>Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    update("slug", e.target.value);
                  }}
                  placeholder="bpc-157"
                  className={`${adminFieldClass} h-8 w-full px-3 font-mono`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                placeholder="Body Protection Compound-157"
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Sequence</label>
              <input
                type="text"
                value={form.sequence}
                onChange={(e) => update("sequence", e.target.value)}
                placeholder="GEPPPGKPADDAGLV"
                className={`${adminFieldClass} h-8 w-full px-3 font-mono`}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                placeholder="Short summary shown on the research hub card."
                className={`${adminFieldClass} min-h-[72px] w-full resize-y px-3 py-2`}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className={labelClass}>MW</label>
                <input
                  type="text"
                  value={form.molecularWeight}
                  onChange={(e) => update("molecularWeight", e.target.value)}
                  placeholder="1419.5 Da"
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>CAS</label>
                <input
                  type="text"
                  value={form.cas}
                  onChange={(e) => update("cas", e.target.value)}
                  placeholder="137525-51-0"
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Product slug</label>
                <input
                  type="text"
                  value={form.productSlug}
                  onChange={(e) => update("productSlug", e.target.value)}
                  placeholder="bpc-157"
                  className={`${adminFieldClass} h-8 w-full px-3 font-mono`}
                />
              </div>
            </div>

            <ImageUploader
              value={form.heroImageUrl}
              onChange={(url) => update("heroImageUrl", url)}
              label="Hero image"
              hint="Displayed on research hub cards."
            />

            <div className="space-y-1">
              <label className={labelClass}>Hero image alt</label>
              <input
                type="text"
                value={form.heroImageAlt}
                onChange={(e) => update("heroImageAlt", e.target.value)}
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap gap-1">
                {form.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.1em]"
                  >
                    {tag}
                    <X className="size-3" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput("");
                    }
                  }}
                  placeholder="Add tag, press Enter"
                  className={`${adminFieldClass} h-8 flex-1 px-3`}
                />
                <button
                  type="button"
                  className={adminSecondaryButtonClass}
                  onClick={() => {
                    addTag(tagInput);
                    setTagInput("");
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className={labelClass}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    update("status", e.target.value as PeptideStatus)
                  }
                  className={`${adminFieldClass} h-8 w-full px-3`}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Sort order</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    update("sortOrder", Number(e.target.value) || 0)
                  }
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>
            </div>

            <details className="rounded border border-border p-2">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                SEO overrides
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <label className={labelClass}>SEO title</label>
                  <input
                    type="text"
                    value={form.seoTitle}
                    onChange={(e) => update("seoTitle", e.target.value)}
                    placeholder={form.name || "Defaults to name"}
                    className={`${adminFieldClass} h-8 w-full px-3`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>SEO description</label>
                  <textarea
                    value={form.seoDescription}
                    onChange={(e) => update("seoDescription", e.target.value)}
                    rows={2}
                    placeholder={form.description || "Defaults to description"}
                    className={`${adminFieldClass} min-h-[56px] w-full resize-y px-3 py-2`}
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={adminSecondaryButtonClass}
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={adminPrimaryButtonClass}
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.slug.trim()}
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              {editingId ? "Save changes" : "Create peptide"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
