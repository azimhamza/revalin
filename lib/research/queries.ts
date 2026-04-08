import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  researchPaperPeptides,
  researchPapers,
  researchPeptides,
  type ResearchPaperAuthor,
} from "@/lib/db/schema";

import { calculateReadingTime } from "./mdx";
import {
  type CreatePaperInput,
  type CreatePeptideInput,
  type UpdatePaperInput,
  type UpdatePeptideInput,
} from "./schemas";

// ── Types ────────────────────────────────────────────────────────────────

export type ResearchPaperRow = typeof researchPapers.$inferSelect;
export type ResearchPeptideRow = typeof researchPeptides.$inferSelect;

export type ResearchPaperWithPeptides = ResearchPaperRow & {
  peptides: ResearchPeptideRow[];
};

export type ResearchPaperSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  readingTimeMinutes: number;
  topics: string[];
  publishedAt: Date | null;
  status: ResearchPaperRow["status"];
  peptides: Pick<ResearchPeptideRow, "id" | "slug" | "name">[];
};

export type ResearchPeptideWithCount = ResearchPeptideRow & {
  paperCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function toSummary(
  paper: ResearchPaperRow,
  peptides: Pick<ResearchPeptideRow, "id" | "slug" | "name">[],
): ResearchPaperSummary {
  return {
    id: paper.id,
    slug: paper.slug,
    title: paper.title,
    excerpt: paper.excerpt,
    heroImageUrl: paper.heroImageUrl,
    heroImageAlt: paper.heroImageAlt,
    readingTimeMinutes: paper.readingTimeMinutes,
    topics: (paper.topics as string[]) ?? [],
    publishedAt: paper.publishedAt,
    status: paper.status,
    peptides,
  };
}

async function hydratePapersWithPeptides<T extends ResearchPaperRow>(
  papers: T[],
): Promise<ResearchPaperSummary[]> {
  if (papers.length === 0) return [];
  const paperIds = papers.map((p) => p.id);

  const links = await db
    .select({
      paperId: researchPaperPeptides.paperId,
      peptideId: researchPeptides.id,
      peptideSlug: researchPeptides.slug,
      peptideName: researchPeptides.name,
    })
    .from(researchPaperPeptides)
    .innerJoin(
      researchPeptides,
      eq(researchPeptides.id, researchPaperPeptides.peptideId),
    )
    .where(inArray(researchPaperPeptides.paperId, paperIds));

  const byPaperId = new Map<
    string,
    Pick<ResearchPeptideRow, "id" | "slug" | "name">[]
  >();
  for (const link of links) {
    const list = byPaperId.get(link.paperId) ?? [];
    list.push({
      id: link.peptideId,
      slug: link.peptideSlug,
      name: link.peptideName,
    });
    byPaperId.set(link.paperId, list);
  }

  return papers.map((paper) => toSummary(paper, byPaperId.get(paper.id) ?? []));
}

async function revalidateResearch(paperSlug?: string, peptideSlugs: string[] = []) {
  try {
    revalidatePath("/research");
    revalidatePath("/research/papers");
    if (paperSlug) revalidatePath(`/research/papers/${paperSlug}`);
    for (const slug of peptideSlugs) {
      revalidatePath(`/research/${slug}`);
    }
    revalidatePath("/sitemap.xml");
  } catch {
    // revalidatePath can throw in non-request contexts (e.g. seed script).
    // That's fine — seeding runs pre-boot.
  }
}

// ── Public reads ─────────────────────────────────────────────────────────

export async function listPublishedPapers({
  limit = 20,
  offset = 0,
  peptideSlug,
  topic,
}: {
  limit?: number;
  offset?: number;
  peptideSlug?: string;
  topic?: string;
} = {}): Promise<ResearchPaperSummary[]> {
  try {
    let paperIdFilter: string[] | undefined;

    if (peptideSlug) {
      const rows = await db
        .select({ paperId: researchPaperPeptides.paperId })
        .from(researchPaperPeptides)
        .innerJoin(
          researchPeptides,
          eq(researchPeptides.id, researchPaperPeptides.peptideId),
        )
        .where(eq(researchPeptides.slug, peptideSlug));
      paperIdFilter = rows.map((r) => r.paperId);
      if (paperIdFilter.length === 0) return [];
    }

    const whereClauses = [eq(researchPapers.status, "published")];
    if (paperIdFilter) {
      whereClauses.push(inArray(researchPapers.id, paperIdFilter));
    }
    if (topic) {
      whereClauses.push(sql`${researchPapers.topics} @> ${JSON.stringify([topic])}::jsonb`);
    }

    const papers = await db
      .select()
      .from(researchPapers)
      .where(and(...whereClauses))
      .orderBy(desc(researchPapers.publishedAt))
      .limit(limit)
      .offset(offset);

    return hydratePapersWithPeptides(papers);
  } catch (error) {
    console.error("[research] listPublishedPapers failed", error);
    return [];
  }
}

export async function getPaperBySlug(
  slug: string,
  { preview = false }: { preview?: boolean } = {},
): Promise<(ResearchPaperWithPeptides & { summary: ResearchPaperSummary }) | null> {
  try {
    const rows = await db
      .select()
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .limit(1);
    const paper = rows[0];
    if (!paper) return null;
    if (!preview && paper.status !== "published") return null;

    const peptides = await db
      .select({
        id: researchPeptides.id,
        slug: researchPeptides.slug,
        name: researchPeptides.name,
        fullName: researchPeptides.fullName,
        sequence: researchPeptides.sequence,
        description: researchPeptides.description,
        molecularWeight: researchPeptides.molecularWeight,
        cas: researchPeptides.cas,
        productSlug: researchPeptides.productSlug,
        heroImageUrl: researchPeptides.heroImageUrl,
        heroImageAlt: researchPeptides.heroImageAlt,
        tags: researchPeptides.tags,
        sortOrder: researchPeptides.sortOrder,
        status: researchPeptides.status,
        seoTitle: researchPeptides.seoTitle,
        seoDescription: researchPeptides.seoDescription,
        createdAt: researchPeptides.createdAt,
        updatedAt: researchPeptides.updatedAt,
      })
      .from(researchPaperPeptides)
      .innerJoin(
        researchPeptides,
        eq(researchPeptides.id, researchPaperPeptides.peptideId),
      )
      .where(eq(researchPaperPeptides.paperId, paper.id))
      .orderBy(asc(researchPaperPeptides.sortOrder));

    return {
      ...paper,
      peptides,
      summary: toSummary(
        paper,
        peptides.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
      ),
    };
  } catch (error) {
    console.error("[research] getPaperBySlug failed", error);
    return null;
  }
}

export async function listPeptides({
  includeDraft = false,
}: { includeDraft?: boolean } = {}): Promise<ResearchPeptideWithCount[]> {
  try {
    const whereClause = includeDraft
      ? undefined
      : eq(researchPeptides.status, "published");

    const rows = whereClause
      ? await db
          .select()
          .from(researchPeptides)
          .where(whereClause)
          .orderBy(
            asc(researchPeptides.sortOrder),
            asc(researchPeptides.name),
          )
      : await db
          .select()
          .from(researchPeptides)
          .orderBy(
            asc(researchPeptides.sortOrder),
            asc(researchPeptides.name),
          );

    if (rows.length === 0) return [];

    const counts = await db
      .select({
        peptideId: researchPaperPeptides.peptideId,
        count: sql<number>`count(*)::int`,
      })
      .from(researchPaperPeptides)
      .innerJoin(
        researchPapers,
        eq(researchPapers.id, researchPaperPeptides.paperId),
      )
      .where(eq(researchPapers.status, "published"))
      .groupBy(researchPaperPeptides.peptideId);

    const countMap = new Map(counts.map((c) => [c.peptideId, Number(c.count)]));

    return rows.map((row) => ({
      ...row,
      paperCount: countMap.get(row.id) ?? 0,
    }));
  } catch (error) {
    console.error("[research] listPeptides failed", error);
    return [];
  }
}

export async function getPeptideBySlug(
  slug: string,
): Promise<
  | {
      peptide: ResearchPeptideRow;
      papers: ResearchPaperSummary[];
    }
  | null
> {
  try {
    const rows = await db
      .select()
      .from(researchPeptides)
      .where(eq(researchPeptides.slug, slug))
      .limit(1);
    const peptide = rows[0];
    if (!peptide) return null;

    const paperRows = await db
      .select({ paper: researchPapers })
      .from(researchPaperPeptides)
      .innerJoin(
        researchPapers,
        eq(researchPapers.id, researchPaperPeptides.paperId),
      )
      .where(
        and(
          eq(researchPaperPeptides.peptideId, peptide.id),
          eq(researchPapers.status, "published"),
        ),
      )
      .orderBy(desc(researchPapers.publishedAt));

    const papers = await hydratePapersWithPeptides(paperRows.map((r) => r.paper));
    return { peptide, papers };
  } catch (error) {
    console.error("[research] getPeptideBySlug failed", error);
    return null;
  }
}

export async function listRelatedPapers(
  paperId: string,
  peptideIds: string[],
  limit = 3,
): Promise<ResearchPaperSummary[]> {
  if (peptideIds.length === 0) return [];
  try {
    const related = await db
      .selectDistinct({ paper: researchPapers })
      .from(researchPaperPeptides)
      .innerJoin(
        researchPapers,
        eq(researchPapers.id, researchPaperPeptides.paperId),
      )
      .where(
        and(
          inArray(researchPaperPeptides.peptideId, peptideIds),
          eq(researchPapers.status, "published"),
          sql`${researchPapers.id} <> ${paperId}`,
        ),
      )
      .orderBy(desc(researchPapers.publishedAt))
      .limit(limit);

    return hydratePapersWithPeptides(related.map((r) => r.paper));
  } catch (error) {
    console.error("[research] listRelatedPapers failed", error);
    return [];
  }
}

// ── Admin reads ──────────────────────────────────────────────────────────

export async function listAllPapersAdmin({
  status,
}: { status?: ResearchPaperRow["status"] } = {}): Promise<ResearchPaperSummary[]> {
  const papers = status
    ? await db
        .select()
        .from(researchPapers)
        .where(eq(researchPapers.status, status))
        .orderBy(desc(researchPapers.updatedAt))
    : await db
        .select()
        .from(researchPapers)
        .orderBy(desc(researchPapers.updatedAt));

  return hydratePapersWithPeptides(papers);
}

export async function getPaperByIdAdmin(
  id: string,
): Promise<ResearchPaperWithPeptides | null> {
  const rows = await db
    .select()
    .from(researchPapers)
    .where(eq(researchPapers.id, id))
    .limit(1);
  const paper = rows[0];
  if (!paper) return null;

  const peptides = await db
    .select({
      id: researchPeptides.id,
      slug: researchPeptides.slug,
      name: researchPeptides.name,
      fullName: researchPeptides.fullName,
      sequence: researchPeptides.sequence,
      description: researchPeptides.description,
      molecularWeight: researchPeptides.molecularWeight,
      cas: researchPeptides.cas,
      productSlug: researchPeptides.productSlug,
      heroImageUrl: researchPeptides.heroImageUrl,
      heroImageAlt: researchPeptides.heroImageAlt,
      tags: researchPeptides.tags,
      sortOrder: researchPeptides.sortOrder,
      status: researchPeptides.status,
      seoTitle: researchPeptides.seoTitle,
      seoDescription: researchPeptides.seoDescription,
      createdAt: researchPeptides.createdAt,
      updatedAt: researchPeptides.updatedAt,
    })
    .from(researchPaperPeptides)
    .innerJoin(
      researchPeptides,
      eq(researchPeptides.id, researchPaperPeptides.peptideId),
    )
    .where(eq(researchPaperPeptides.paperId, paper.id))
    .orderBy(asc(researchPaperPeptides.sortOrder));

  return { ...paper, peptides };
}

export async function getPeptideByIdAdmin(
  id: string,
): Promise<ResearchPeptideRow | null> {
  const rows = await db
    .select()
    .from(researchPeptides)
    .where(eq(researchPeptides.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function createPaper(
  input: CreatePaperInput,
  createdBy: string | null,
): Promise<ResearchPaperRow> {
  const readingMinutes = calculateReadingTime(input.mdxContent ?? "");
  const publishedAt =
    input.status === "published" ? new Date() : null;

  const inserted = await db.transaction(async (tx) => {
    const [paper] = await tx
      .insert(researchPapers)
      .values({
        slug: input.slug,
        title: input.title,
        subtitle: input.subtitle ?? null,
        excerpt: input.excerpt ?? null,
        heroImageUrl: input.heroImageUrl ?? null,
        heroImageAlt: input.heroImageAlt ?? null,
        authors: (input.authors ?? []) as ResearchPaperAuthor[],
        publicationDate: input.publicationDate
          ? new Date(input.publicationDate)
          : null,
        doi: input.doi ?? null,
        externalUrl: input.externalUrl ?? null,
        mdxContent: input.mdxContent ?? "",
        readingTimeMinutes: readingMinutes,
        topics: input.topics ?? [],
        status: input.status,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        ogImageUrl: input.ogImageUrl ?? null,
        canonicalUrl: input.canonicalUrl ?? null,
        publishedAt,
        createdBy: createdBy ?? null,
      })
      .returning();

    if (input.peptideIds && input.peptideIds.length > 0) {
      await tx.insert(researchPaperPeptides).values(
        input.peptideIds.map((peptideId, index) => ({
          paperId: paper.id,
          peptideId,
          sortOrder: index,
        })),
      );
    }

    return paper;
  });

  const peptideSlugsForRevalidation = await fetchPeptideSlugsForIds(
    input.peptideIds ?? [],
  );
  await revalidateResearch(inserted.slug, peptideSlugsForRevalidation);
  return inserted;
}

export async function updatePaper(
  id: string,
  input: UpdatePaperInput,
): Promise<ResearchPaperRow> {
  const existingRows = await db
    .select()
    .from(researchPapers)
    .where(eq(researchPapers.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new Error("Paper not found");
  }

  const nextMdx = input.mdxContent ?? existing.mdxContent;
  const readingMinutes =
    input.mdxContent !== undefined
      ? calculateReadingTime(nextMdx)
      : existing.readingTimeMinutes;

  const willBePublished =
    input.status === "published" && existing.status !== "published";
  const publishedAt = willBePublished
    ? new Date()
    : input.status === "draft" || input.status === "archived"
      ? existing.publishedAt
      : existing.publishedAt;

  const updated = await db.transaction(async (tx) => {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
      readingTimeMinutes: readingMinutes,
      publishedAt,
    };

    const assignIfPresent = <K extends keyof UpdatePaperInput>(
      key: K,
      column: string,
      transform?: (value: NonNullable<UpdatePaperInput[K]>) => unknown,
    ) => {
      if (input[key] !== undefined) {
        const value = input[key] as NonNullable<UpdatePaperInput[K]>;
        updatePayload[column] = transform ? transform(value) : value;
      }
    };

    assignIfPresent("slug", "slug");
    assignIfPresent("title", "title");
    assignIfPresent("subtitle", "subtitle", (v) => v || null);
    assignIfPresent("excerpt", "excerpt", (v) => v || null);
    assignIfPresent("heroImageUrl", "heroImageUrl", (v) => v || null);
    assignIfPresent("heroImageAlt", "heroImageAlt", (v) => v || null);
    assignIfPresent("authors", "authors");
    assignIfPresent("publicationDate", "publicationDate", (v) =>
      v ? new Date(v as string) : null,
    );
    assignIfPresent("doi", "doi", (v) => v || null);
    assignIfPresent("externalUrl", "externalUrl", (v) => v || null);
    assignIfPresent("mdxContent", "mdxContent");
    assignIfPresent("topics", "topics");
    assignIfPresent("status", "status");
    assignIfPresent("seoTitle", "seoTitle", (v) => v || null);
    assignIfPresent("seoDescription", "seoDescription", (v) => v || null);
    assignIfPresent("ogImageUrl", "ogImageUrl", (v) => v || null);
    assignIfPresent("canonicalUrl", "canonicalUrl", (v) => v || null);

    const [paper] = await tx
      .update(researchPapers)
      .set(updatePayload as any)
      .where(eq(researchPapers.id, id))
      .returning();

    if (input.peptideIds !== undefined) {
      await tx
        .delete(researchPaperPeptides)
        .where(eq(researchPaperPeptides.paperId, id));
      if (input.peptideIds.length > 0) {
        await tx.insert(researchPaperPeptides).values(
          input.peptideIds.map((peptideId, index) => ({
            paperId: id,
            peptideId,
            sortOrder: index,
          })),
        );
      }
    }

    return paper;
  });

  const affectedPeptideIds =
    input.peptideIds ??
    (
      await db
        .select({ peptideId: researchPaperPeptides.peptideId })
        .from(researchPaperPeptides)
        .where(eq(researchPaperPeptides.paperId, id))
    ).map((r) => r.peptideId);
  const peptideSlugsForRevalidation =
    await fetchPeptideSlugsForIds(affectedPeptideIds);

  await revalidateResearch(updated.slug, peptideSlugsForRevalidation);
  if (existing.slug !== updated.slug) {
    try {
      revalidatePath(`/research/papers/${existing.slug}`);
    } catch {
      // ignore outside request
    }
  }
  return updated;
}

export async function deletePaper(id: string): Promise<void> {
  const rows = await db
    .select({ slug: researchPapers.slug })
    .from(researchPapers)
    .where(eq(researchPapers.id, id))
    .limit(1);
  const slug = rows[0]?.slug;
  const affectedPeptideIds = (
    await db
      .select({ peptideId: researchPaperPeptides.peptideId })
      .from(researchPaperPeptides)
      .where(eq(researchPaperPeptides.paperId, id))
  ).map((r) => r.peptideId);

  await db.delete(researchPapers).where(eq(researchPapers.id, id));

  const slugs = await fetchPeptideSlugsForIds(affectedPeptideIds);
  await revalidateResearch(slug, slugs);
}

export async function createPeptide(
  input: CreatePeptideInput,
): Promise<ResearchPeptideRow> {
  const [inserted] = await db
    .insert(researchPeptides)
    .values({
      slug: input.slug,
      name: input.name,
      fullName: input.fullName ?? null,
      sequence: input.sequence ?? null,
      description: input.description ?? null,
      molecularWeight: input.molecularWeight ?? null,
      cas: input.cas ?? null,
      productSlug: input.productSlug ?? null,
      heroImageUrl: input.heroImageUrl ?? null,
      heroImageAlt: input.heroImageAlt ?? null,
      tags: input.tags ?? [],
      sortOrder: input.sortOrder ?? 0,
      status: input.status,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
    })
    .returning();

  await revalidateResearch(undefined, [inserted.slug]);
  return inserted;
}

export async function updatePeptide(
  id: string,
  input: UpdatePeptideInput,
): Promise<ResearchPeptideRow> {
  const existingRows = await db
    .select()
    .from(researchPeptides)
    .where(eq(researchPeptides.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new Error("Peptide not found");
  }

  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  const assignIfPresent = <K extends keyof UpdatePeptideInput>(
    key: K,
    column: string,
    transform?: (value: NonNullable<UpdatePeptideInput[K]>) => unknown,
  ) => {
    if (input[key] !== undefined) {
      const value = input[key] as NonNullable<UpdatePeptideInput[K]>;
      updatePayload[column] = transform ? transform(value) : value;
    }
  };

  assignIfPresent("slug", "slug");
  assignIfPresent("name", "name");
  assignIfPresent("fullName", "fullName", (v) => v || null);
  assignIfPresent("sequence", "sequence", (v) => v || null);
  assignIfPresent("description", "description", (v) => v || null);
  assignIfPresent("molecularWeight", "molecularWeight", (v) => v || null);
  assignIfPresent("cas", "cas", (v) => v || null);
  assignIfPresent("productSlug", "productSlug", (v) => v || null);
  assignIfPresent("heroImageUrl", "heroImageUrl", (v) => v || null);
  assignIfPresent("heroImageAlt", "heroImageAlt", (v) => v || null);
  assignIfPresent("tags", "tags");
  assignIfPresent("sortOrder", "sortOrder");
  assignIfPresent("status", "status");
  assignIfPresent("seoTitle", "seoTitle", (v) => v || null);
  assignIfPresent("seoDescription", "seoDescription", (v) => v || null);

  const [updated] = await db
    .update(researchPeptides)
    .set(updatePayload as any)
    .where(eq(researchPeptides.id, id))
    .returning();

  const slugsToRevalidate = new Set<string>();
  slugsToRevalidate.add(updated.slug);
  if (existing.slug !== updated.slug) slugsToRevalidate.add(existing.slug);
  await revalidateResearch(undefined, Array.from(slugsToRevalidate));
  return updated;
}

export async function deletePeptide(
  id: string,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const existingRows = await db
    .select()
    .from(researchPeptides)
    .where(eq(researchPeptides.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return;

  const linkCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(researchPaperPeptides)
    .where(eq(researchPaperPeptides.peptideId, id));

  const count = Number(linkCount[0]?.count ?? 0);
  if (count > 0 && !force) {
    throw new Error(
      `Peptide has ${count} linked paper${count === 1 ? "" : "s"}. Pass force=true to delete anyway.`,
    );
  }

  await db.delete(researchPeptides).where(eq(researchPeptides.id, id));
  await revalidateResearch(undefined, [existing.slug]);
}

// ── Internal helpers ─────────────────────────────────────────────────────

async function fetchPeptideSlugsForIds(
  peptideIds: string[],
): Promise<string[]> {
  if (peptideIds.length === 0) return [];
  const rows = await db
    .select({ slug: researchPeptides.slug })
    .from(researchPeptides)
    .where(inArray(researchPeptides.id, peptideIds));
  return rows.map((r) => r.slug);
}
