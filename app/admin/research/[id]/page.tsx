import { notFound } from "next/navigation";

import { getPaperByIdAdmin, listPeptides } from "@/lib/research/queries";

import { PaperEditor } from "./paper-editor";

export const metadata = {
  title: "Edit Research Paper | Revalin Admin",
};

export const dynamic = "force-dynamic";

type EditPaperPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditResearchPaperPage({
  params,
}: EditPaperPageProps) {
  const { id } = await params;
  const [paper, peptides] = await Promise.all([
    getPaperByIdAdmin(id),
    listPeptides({ includeDraft: true }),
  ]);

  if (!paper) notFound();

  const peptideOptions = peptides.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
  }));

  const initialPaper = {
    id: paper.id,
    slug: paper.slug,
    title: paper.title,
    subtitle: paper.subtitle,
    excerpt: paper.excerpt,
    heroImageUrl: paper.heroImageUrl,
    heroImageAlt: paper.heroImageAlt,
    authors: paper.authors ?? [],
    publicationDate: paper.publicationDate
      ? paper.publicationDate.toISOString()
      : null,
    doi: paper.doi,
    externalUrl: paper.externalUrl,
    mdxContent: paper.mdxContent,
    readingTimeMinutes: paper.readingTimeMinutes,
    topics: (paper.topics as string[]) ?? [],
    status: paper.status,
    seoTitle: paper.seoTitle,
    seoDescription: paper.seoDescription,
    ogImageUrl: paper.ogImageUrl,
    canonicalUrl: paper.canonicalUrl,
    publishedAt: paper.publishedAt ? paper.publishedAt.toISOString() : null,
    peptideIds: paper.peptides.map((p) => p.id),
  };

  return (
    <PaperEditor
      initialPaper={initialPaper}
      peptideOptions={peptideOptions}
    />
  );
}
