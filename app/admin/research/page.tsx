import { listAllPapersAdmin, listPeptides } from "@/lib/research/queries";

import { ResearchManagement } from "./research-management";

export const metadata = {
  title: "Research Management | Revalin Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminResearchPage() {
  const [papers, peptides] = await Promise.all([
    listAllPapersAdmin(),
    listPeptides({ includeDraft: true }),
  ]);

  const peptideOptions = peptides.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
  }));

  return <ResearchManagement initialPapers={papers} peptides={peptideOptions} />;
}
