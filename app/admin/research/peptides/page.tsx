import { listPeptides } from "@/lib/research/queries";

import { PeptideManagement } from "./peptide-management";

export const metadata = {
  title: "Peptide Library | Revalin Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminPeptidesPage() {
  const peptides = await listPeptides({ includeDraft: true });

  const rows = peptides.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    fullName: p.fullName,
    sequence: p.sequence,
    description: p.description,
    molecularWeight: p.molecularWeight,
    cas: p.cas,
    productSlug: p.productSlug,
    heroImageUrl: p.heroImageUrl,
    heroImageAlt: p.heroImageAlt,
    tags: (p.tags as string[]) ?? [],
    sortOrder: p.sortOrder,
    status: p.status,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    paperCount: p.paperCount,
  }));

  return <PeptideManagement initialPeptides={rows} />;
}
