import { listPeptides } from "@/lib/research/queries";

import { PaperEditor } from "../[id]/paper-editor";

export const metadata = {
  title: "New Research Paper | Revalin Admin",
};

export const dynamic = "force-dynamic";

export default async function NewResearchPaperPage() {
  const peptides = await listPeptides({ includeDraft: true });

  const peptideOptions = peptides.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
  }));

  return <PaperEditor initialPaper={null} peptideOptions={peptideOptions} />;
}
