"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminPanel,
  AdminSectionHeader,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "../../_components/admin-shell";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import { ImageUploader } from "../_components/image-uploader";
import { MdxEditor } from "../_components/mdx-editor";
import { slugify } from "@/lib/research/slug";

type PaperStatus = "draft" | "published" | "archived";

type PaperAuthor = {
  name: string;
  affiliation?: string;
  orcid?: string;
};

type InitialPaper = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  authors: PaperAuthor[];
  publicationDate: string | null;
  doi: string | null;
  externalUrl: string | null;
  mdxContent: string;
  readingTimeMinutes: number;
  topics: string[];
  status: PaperStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  peptideIds: string[];
};

type PeptideOption = {
  id: string;
  slug: string;
  name: string;
};

type PaperEditorProps = {
  initialPaper: InitialPaper | null;
  peptideOptions: PeptideOption[];
};

type FormState = {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  heroImageUrl: string | null;
  heroImageAlt: string;
  authors: PaperAuthor[];
  publicationDate: string;
  doi: string;
  externalUrl: string;
  mdxContent: string;
  topics: string[];
  status: PaperStatus;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string | null;
  canonicalUrl: string;
  peptideIds: string[];
};

function makeInitialFormState(paper: InitialPaper | null): FormState {
  if (!paper) {
    return {
      slug: "",
      title: "",
      subtitle: "",
      excerpt: "",
      heroImageUrl: null,
      heroImageAlt: "",
      authors: [],
      publicationDate: "",
      doi: "",
      externalUrl: "",
      mdxContent: "",
      topics: [],
      status: "draft",
      seoTitle: "",
      seoDescription: "",
      ogImageUrl: null,
      canonicalUrl: "",
      peptideIds: [],
    };
  }
  return {
    slug: paper.slug,
    title: paper.title,
    subtitle: paper.subtitle ?? "",
    excerpt: paper.excerpt ?? "",
    heroImageUrl: paper.heroImageUrl,
    heroImageAlt: paper.heroImageAlt ?? "",
    authors: paper.authors ?? [],
    publicationDate: paper.publicationDate
      ? paper.publicationDate.slice(0, 10)
      : "",
    doi: paper.doi ?? "",
    externalUrl: paper.externalUrl ?? "",
    mdxContent: paper.mdxContent ?? "",
    topics: paper.topics ?? [],
    status: paper.status,
    seoTitle: paper.seoTitle ?? "",
    seoDescription: paper.seoDescription ?? "",
    ogImageUrl: paper.ogImageUrl,
    canonicalUrl: paper.canonicalUrl ?? "",
    peptideIds: paper.peptideIds ?? [],
  };
}

export function PaperEditor({ initialPaper, peptideOptions }: PaperEditorProps) {
  const router = useRouter();
  const isEdit = initialPaper !== null;
  const [form, setForm] = useState<FormState>(makeInitialFormState(initialPaper));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingTarget, setSavingTarget] = useState<PaperStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [topicInput, setTopicInput] = useState("");

  const update = useCallback(<K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  // Auto-derive slug from title if user hasn't touched slug
  useEffect(() => {
    if (slugTouched) return;
    if (!form.title) return;
    setForm((prev) => ({ ...prev, slug: slugify(prev.title) }));
  }, [form.title, slugTouched]);

  // beforeunload warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function buildPayload(status: PaperStatus) {
    return {
      slug: form.slug.trim(),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      excerpt: form.excerpt.trim() || undefined,
      heroImageUrl: form.heroImageUrl || undefined,
      heroImageAlt: form.heroImageAlt.trim() || undefined,
      authors: form.authors
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          affiliation: a.affiliation?.trim() || undefined,
          orcid: a.orcid?.trim() || undefined,
        })),
      publicationDate: form.publicationDate
        ? new Date(form.publicationDate).toISOString()
        : undefined,
      doi: form.doi.trim() || undefined,
      externalUrl: form.externalUrl.trim() || undefined,
      mdxContent: form.mdxContent,
      topics: form.topics,
      peptideIds: form.peptideIds,
      status,
      seoTitle: form.seoTitle.trim() || undefined,
      seoDescription: form.seoDescription.trim() || undefined,
      ogImageUrl: form.ogImageUrl || undefined,
      canonicalUrl: form.canonicalUrl.trim() || undefined,
    };
  }

  async function handleSave(status: PaperStatus) {
    setError(null);
    setSaving(true);
    setSavingTarget(status);
    try {
      const payload = buildPayload(status);
      const url = isEdit
        ? `/api/admin/research/papers/${initialPaper!.id}`
        : `/api/admin/research/papers`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const payloadData = await readJsonSafely(res);
      const data =
        getApiData<{ paper?: { id?: string } }>(payloadData) ??
        (payloadData as { paper?: { id?: string } });
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payloadData, `Save failed (${res.status})`));
      }
      setDirty(false);
      if (!isEdit && data?.paper?.id) {
        router.replace(`/admin/research/${data.paper.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setSavingTarget(null);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    if (!confirm("Delete this paper? This cannot be undone.")) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/research/papers/${initialPaper!.id}`,
        {
          method: "DELETE",
        },
      );
      const payload = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Delete failed (${res.status})`));
      }
      setDirty(false);
      router.replace("/admin/research");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  const selectedPeptides = useMemo(
    () => peptideOptions.filter((p) => form.peptideIds.includes(p.id)),
    [peptideOptions, form.peptideIds],
  );

  const unselectedPeptides = useMemo(
    () => peptideOptions.filter((p) => !form.peptideIds.includes(p.id)),
    [peptideOptions, form.peptideIds],
  );

  function addTopic(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) return;
    if (form.topics.includes(trimmed)) return;
    update("topics", [...form.topics, trimmed]);
  }

  function removeTopic(topic: string) {
    update(
      "topics",
      form.topics.filter((t) => t !== topic),
    );
  }

  function addAuthor() {
    update("authors", [...form.authors, { name: "" }]);
  }

  function updateAuthor(index: number, patch: Partial<PaperAuthor>) {
    update(
      "authors",
      form.authors.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }

  function removeAuthor(index: number) {
    update(
      "authors",
      form.authors.filter((_, i) => i !== index),
    );
  }

  function togglePeptide(id: string) {
    if (form.peptideIds.includes(id)) {
      update(
        "peptideIds",
        form.peptideIds.filter((x) => x !== id),
      );
    } else {
      update("peptideIds", [...form.peptideIds, id]);
    }
  }

  const labelClass =
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
  const fieldGroup = "space-y-1.5";

  return (
    <div className="space-y-3 pb-24">
      <AdminPanel tone="inverse">
        <AdminSectionHeader
          eyebrow={isEdit ? "Edit paper" : "New paper"}
          title={form.title || "Untitled paper"}
          description={
            isEdit
              ? `Editing existing paper · /research/papers/${form.slug || "…"}`
              : "Author a new research paper. All content is research-use only."
          }
          action={
            <Link
              href="/admin/research"
              className={adminSecondaryButtonClass}
            >
              <ArrowLeft className="size-3" /> Back
            </Link>
          }
        />
      </AdminPanel>

      {error ? (
        <AdminPanel className="border-red-500/30 bg-red-500/5">
          <p className="text-xs text-red-500">{error}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <Tabs defaultValue="content">
          <TabsList className="mb-4">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="publish">Publish</TabsTrigger>
          </TabsList>

          {/* ── Content ────────────────────────────────────── */}
          <TabsContent value="content" className="space-y-4">
            <div className={fieldGroup}>
              <label className={labelClass}>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. BPC-157 in Inflammatory Bowel Disease Trials"
                className={`${adminFieldClass} h-9 w-full px-3 text-sm`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Slug *</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  /research/papers/
                </span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    update("slug", e.target.value);
                  }}
                  placeholder="auto-derived-from-title"
                  className={`${adminFieldClass} h-8 flex-1 px-2 font-mono`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Lowercase letters, numbers, hyphens only.
              </p>
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Subtitle</label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => update("subtitle", e.target.value)}
                placeholder="Short phrase below the title"
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Excerpt</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
                rows={3}
                placeholder="Short summary shown on cards and in search results."
                className={`${adminFieldClass} min-h-[72px] w-full resize-y px-3 py-2`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>MDX content</label>
              <MdxEditor
                value={form.mdxContent}
                onChange={(value) => update("mdxContent", value)}
              />
            </div>
          </TabsContent>

          {/* ── Metadata ────────────────────────────────────── */}
          <TabsContent value="metadata" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className={fieldGroup}>
                <label className={labelClass}>Publication date</label>
                <input
                  type="date"
                  value={form.publicationDate}
                  onChange={(e) => update("publicationDate", e.target.value)}
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>

              <div className={fieldGroup}>
                <label className={labelClass}>DOI</label>
                <input
                  type="text"
                  value={form.doi}
                  onChange={(e) => update("doi", e.target.value)}
                  placeholder="10.1234/example"
                  className={`${adminFieldClass} h-8 w-full px-3`}
                />
              </div>
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>External URL</label>
              <input
                type="url"
                value={form.externalUrl}
                onChange={(e) => update("externalUrl", e.target.value)}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/…"
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <div className={fieldGroup}>
              <div className="flex items-center justify-between">
                <label className={labelClass}>Authors</label>
                <button
                  type="button"
                  className={adminSecondaryButtonClass}
                  onClick={addAuthor}
                >
                  <Plus className="size-3" /> Add author
                </button>
              </div>
              {form.authors.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  No authors yet. Add one to display attribution.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.authors.map((author, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded border border-border p-2 md:grid-cols-[1fr_1fr_140px_auto]"
                    >
                      <input
                        type="text"
                        value={author.name}
                        onChange={(e) =>
                          updateAuthor(index, { name: e.target.value })
                        }
                        placeholder="Name"
                        className={`${adminFieldClass} h-8 px-2`}
                      />
                      <input
                        type="text"
                        value={author.affiliation ?? ""}
                        onChange={(e) =>
                          updateAuthor(index, { affiliation: e.target.value })
                        }
                        placeholder="Affiliation"
                        className={`${adminFieldClass} h-8 px-2`}
                      />
                      <input
                        type="text"
                        value={author.orcid ?? ""}
                        onChange={(e) =>
                          updateAuthor(index, { orcid: e.target.value })
                        }
                        placeholder="ORCID"
                        className={`${adminFieldClass} h-8 px-2`}
                      />
                      <button
                        type="button"
                        onClick={() => removeAuthor(index)}
                        className={adminSecondaryButtonClass}
                        title="Remove author"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Linked peptides</label>
              {selectedPeptides.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedPeptides.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePeptide(p.id)}
                      className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground"
                    >
                      {p.name}
                      <X className="size-3" />
                    </button>
                  ))}
                </div>
              ) : null}
              {unselectedPeptides.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {unselectedPeptides.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePeptide(p.id)}
                      className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Plus className="size-3" />
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {peptideOptions.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  No peptides in the library yet.{" "}
                  <Link
                    href="/admin/research/peptides"
                    className="underline hover:text-foreground"
                  >
                    Create one
                  </Link>
                  .
                </p>
              ) : null}
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Topics</label>
              <div className="flex flex-wrap gap-1">
                {form.topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => removeTopic(topic)}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.1em]"
                  >
                    {topic}
                    <X className="size-3" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTopic(topicInput);
                      setTopicInput("");
                    }
                  }}
                  placeholder="Add topic, press Enter"
                  className={`${adminFieldClass} h-8 flex-1 px-3`}
                />
                <button
                  type="button"
                  onClick={() => {
                    addTopic(topicInput);
                    setTopicInput("");
                  }}
                  className={adminSecondaryButtonClass}
                >
                  Add
                </button>
              </div>
            </div>

            {isEdit ? (
              <p className="text-[10px] text-muted-foreground">
                Reading time: {initialPaper!.readingTimeMinutes} min (recomputed
                on save)
              </p>
            ) : null}
          </TabsContent>

          {/* ── Media ────────────────────────────────────── */}
          <TabsContent value="media" className="space-y-4">
            <ImageUploader
              value={form.heroImageUrl}
              onChange={(url) => update("heroImageUrl", url)}
              label="Hero image"
              hint="Shown at the top of the paper and in cards."
            />

            <div className={fieldGroup}>
              <label className={labelClass}>Hero image alt text</label>
              <input
                type="text"
                value={form.heroImageAlt}
                onChange={(e) => update("heroImageAlt", e.target.value)}
                placeholder="Describe the hero image for accessibility"
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <ImageUploader
              value={form.ogImageUrl}
              onChange={(url) => update("ogImageUrl", url)}
              label="OG image override (optional)"
              hint="Defaults to hero image if empty. Recommended 1200×630."
            />

            <p className="text-[10px] text-muted-foreground">
              Tip: after uploading an image, copy its URL to embed inline in
              your MDX with <code>&lt;Figure src=&quot;…&quot; /&gt;</code>.
            </p>
          </TabsContent>

          {/* ── SEO ────────────────────────────────────── */}
          <TabsContent value="seo" className="space-y-4">
            <div className={fieldGroup}>
              <label className={labelClass}>SEO title</label>
              <input
                type="text"
                value={form.seoTitle}
                onChange={(e) => update("seoTitle", e.target.value)}
                placeholder={form.title || "Defaults to paper title"}
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>SEO description</label>
              <textarea
                value={form.seoDescription}
                onChange={(e) => update("seoDescription", e.target.value)}
                rows={3}
                placeholder={form.excerpt || "Defaults to paper excerpt"}
                className={`${adminFieldClass} min-h-[72px] w-full resize-y px-3 py-2`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={labelClass}>Canonical URL</label>
              <input
                type="url"
                value={form.canonicalUrl}
                onChange={(e) => update("canonicalUrl", e.target.value)}
                placeholder="https://revalin.com/research/papers/…"
                className={`${adminFieldClass} h-8 w-full px-3`}
              />
            </div>
          </TabsContent>

          {/* ── Publish ────────────────────────────────────── */}
          <TabsContent value="publish" className="space-y-4">
            <div className={fieldGroup}>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  update("status", e.target.value as PaperStatus)
                }
                className={`${adminFieldClass} h-8 w-full px-3`}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {isEdit && initialPaper!.publishedAt ? (
              <p className="text-[10px] text-muted-foreground">
                First published:{" "}
                {new Date(initialPaper!.publishedAt).toLocaleString()}
              </p>
            ) : null}

            <div className="rounded border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p className="font-semibold uppercase tracking-[0.14em] text-foreground">
                Publish checklist
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Title, slug, and excerpt are filled in</li>
                <li>Hero image uploaded + alt text set</li>
                <li>At least one peptide linked</li>
                <li>MDX preview renders cleanly</li>
                <li>SEO title + description reviewed</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </AdminPanel>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="text-[10px] text-muted-foreground">
            {dirty ? (
              <span className="font-semibold text-amber-600">
                Unsaved changes
              </span>
            ) : isEdit ? (
              "Saved"
            ) : (
              "New draft"
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEdit ? (
              <>
                <Link
                  href={`/research/papers/${form.slug}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                  className={adminSecondaryButtonClass}
                >
                  <ExternalLink className="size-3" /> Preview
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className={adminSecondaryButtonClass}
                >
                  {deleting ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                  Delete
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving}
              className={adminSecondaryButtonClass}
            >
              {saving && savingTarget === "draft" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              Save draft
            </button>
            <button
              type="button"
              onClick={() => handleSave("published")}
              disabled={saving}
              className={adminPrimaryButtonClass}
            >
              {saving && savingTarget === "published" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              Save & publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
