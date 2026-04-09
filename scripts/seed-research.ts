/**
 * Seeds the research_peptides, research_papers, and research_paper_peptides
 * tables with the content that previously lived hardcoded in
 *   app/research/page.tsx         (6 peptide summaries)
 *   app/research/[slug]/page.tsx  (11 BPC-157 + TB-500 articles)
 *
 * Run with:
 *   pnpm tsx scripts/seed-research.ts
 * or
 *   pnpm db:seed:research
 *
 * Safe to re-run — upserts on slug + uses ON CONFLICT DO NOTHING on join rows.
 *
 * This script uses its own `postgres` connection and does NOT import the
 * Drizzle singleton from `lib/db`, so it can be executed without needing the
 * Next.js runtime to be up.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// ── Load DATABASE_URL from env or .env.local ────────────────────────────────

function readDatabaseUrlFromEnvFile(fileName: string): string | undefined {
  const filePath = path.resolve(process.cwd(), fileName);
  try {
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      if (!line.startsWith("DATABASE_URL=")) continue;
      return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ||
  readDatabaseUrlFromEnvFile(".env.local") ||
  readDatabaseUrlFromEnvFile(".env");

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Set it in the env or in .env.local.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

// ── Slugify ─────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// ── Seed data (lifted from app/research/page.tsx + app/research/[slug]/page.tsx)

type PeptideSeed = {
  slug: string;
  name: string;
  fullName?: string;
  sequence: string;
  description: string;
  molecularWeight?: string;
  cas?: string;
  productSlug?: string;
  tags: string[];
  sortOrder: number;
};

type StudySeed = {
  title: string;
  authors: string;
  year: string;
  pmid: string;
  url: string;
};

type PaperSeed = {
  peptideSlug: string;
  legacyId: string;
  title: string;
  excerpt: string;
  topic: string;
  date: string;
  readTime: string;
  studies: StudySeed[];
};

const PEPTIDES: PeptideSeed[] = [
  {
    slug: "bpc-157",
    name: "BPC-157",
    fullName: "Body Protection Compound 157",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    description:
      "A pentadecapeptide derived from body protection compound, studied for its potential in tissue repair and healing research.",
    molecularWeight: "1419.53 g/mol",
    cas: "137525-51-0",
    productSlug: "bpc-157",
    tags: ["Healing", "Recovery", "Tissue Repair"],
    sortOrder: 10,
  },
  {
    slug: "tb-500",
    name: "TB-500",
    fullName: "Thymosin Beta-4 Fragment",
    sequence:
      "Ac-Ser-Asp-Lys-Pro-Asp-Met-Ala-Glu-Ile-Glu-Lys-Phe-Asp-Lys-Ser-Lys-Leu-Lys-Lys-Thr-Glu-Thr",
    description:
      "A synthetic peptide fragment of Thymosin Beta-4, researched for cellular migration and differentiation studies.",
    molecularWeight: "4963.44 g/mol",
    cas: "77591-33-4",
    productSlug: "tb-500",
    tags: ["Recovery", "Cellular", "Migration"],
    sortOrder: 20,
  },
  {
    slug: "ghk-cu",
    name: "GHK-Cu",
    sequence: "Gly-His-Lys",
    description:
      "A copper-binding tripeptide naturally present in human plasma, studied for its role in wound healing and tissue remodeling.",
    tags: ["Copper", "Healing", "Remodeling"],
    sortOrder: 30,
  },
  {
    slug: "cjc-1295",
    name: "CJC-1295",
    sequence: "Tyr-D-Ala-Asp-Ala-Ile-Phe-Thr-Gln-Ser-Tyr-Arg-Lys...",
    description:
      "A growth hormone-releasing hormone analog studied for its extended half-life and sustained release properties.",
    tags: ["GHRH", "Growth Factor", "Analog"],
    sortOrder: 40,
  },
  {
    slug: "ipamorelin",
    name: "Ipamorelin",
    sequence: "Aib-His-D-2-Nal-D-Phe-Lys-NH2",
    description:
      "A selective growth hormone secretagogue receptor agonist researched for its specificity and minimal side effects.",
    tags: ["GHSR", "Selective", "Secretagogue"],
    sortOrder: 50,
  },
  {
    slug: "selank",
    name: "Selank",
    sequence: "Thr-Lys-Pro-Arg-Pro-Gly-Pro",
    description:
      "A synthetic analog of tuftsin with anxiolytic properties, studied for its cognitive and neuroprotective effects.",
    tags: ["Cognitive", "Neuroprotective", "Anxiolytic"],
    sortOrder: 60,
  },
];

const PAPERS: PaperSeed[] = [
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-ibd",
    title: "BPC-157 in Inflammatory Bowel Disease Trials",
    excerpt:
      "An overview of clinical research exploring the stable gastric pentadecapeptide BPC 157 in the context of inflammatory bowel disease, including mechanisms of action and observed outcomes.",
    topic: "Gastrointestinal",
    date: "2024-01-15",
    readTime: "8 min read",
    studies: [
      {
        title:
          "Stable gastric pentadecapeptide BPC 157 in trials for inflammatory bowel disease",
        authors: "Seiwerth S, et al.",
        year: "2018",
        pmid: "29469625",
        url: "https://pubmed.ncbi.nlm.nih.gov/29469625/",
      },
    ],
  },
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-vessels",
    title: "BPC-157 and Blood Vessel Formation",
    excerpt:
      "Research into BPC-157's role in angiogenesis and blood vessel repair, examining its effects on endothelial cell migration and vascular growth factor expression.",
    topic: "Angiogenesis",
    date: "2023-12-10",
    readTime: "6 min read",
    studies: [
      {
        title: "BPC 157 and blood vessels",
        authors: "Sikiric P, et al.",
        year: "2008",
        pmid: "18386906",
        url: "https://pubmed.ncbi.nlm.nih.gov/18386906/",
      },
    ],
  },
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-tendon",
    title: "Tendon Healing Mechanisms of BPC-157",
    excerpt:
      "A review of studies investigating BPC-157's potential to accelerate tendon-to-bone healing, including collagen fiber organization and growth factor modulation.",
    topic: "Tissue Repair",
    date: "2023-11-05",
    readTime: "7 min read",
    studies: [],
  },
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-neuro",
    title: "Neuroprotective Properties of BPC-157",
    excerpt:
      "Exploring the research on BPC-157's interactions with the dopaminergic and serotonergic systems, and its potential neuroprotective applications.",
    topic: "Neuroprotection",
    date: "2023-10-20",
    readTime: "10 min read",
    studies: [],
  },
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-storage",
    title: "Storage & Reconstitution Protocol for BPC-157",
    excerpt:
      "Best practices for storing lyophilized BPC-157 at -20°C, reconstitution with bacteriostatic water, and maintaining peptide stability over time.",
    topic: "Protocols",
    date: "2023-09-12",
    readTime: "4 min read",
    studies: [],
  },
  {
    peptideSlug: "bpc-157",
    legacyId: "bpc-gi",
    title: "Gastric Cytoprotection Research with BPC-157",
    excerpt:
      "Examining BPC-157's cytoprotective effects on gastric mucosa, including protection against ethanol- and NSAID-induced lesions in research models.",
    topic: "Gastrointestinal",
    date: "2023-08-08",
    readTime: "9 min read",
    studies: [],
  },
  {
    peptideSlug: "tb-500",
    legacyId: "tb-regen",
    title: "Thymosin Beta-4: A Multi-Functional Regenerative Peptide",
    excerpt:
      "A comprehensive review of Thymosin Beta-4's role in regenerative biology, covering wound healing, anti-inflammatory properties, and stem cell differentiation.",
    topic: "Regeneration",
    date: "2024-02-03",
    readTime: "12 min read",
    studies: [
      {
        title: "Thymosin β4: a multi-functional regenerative peptide",
        authors: "Goldstein AL, et al.",
        year: "2012",
        pmid: "22357552",
        url: "https://pubmed.ncbi.nlm.nih.gov/22357552/",
      },
    ],
  },
  {
    peptideSlug: "tb-500",
    legacyId: "tb-dermal",
    title: "Dermal Healing and TB-500",
    excerpt:
      "Research into how Thymosin Beta-4 promotes dermal wound healing through keratinocyte migration, collagen deposition, and angiogenesis.",
    topic: "Wound Healing",
    date: "2024-01-18",
    readTime: "7 min read",
    studies: [
      {
        title: "Thymosin beta4 promotes dermal healing",
        authors: "Philp D, et al.",
        year: "2003",
        pmid: "12692256",
        url: "https://pubmed.ncbi.nlm.nih.gov/12692256/",
      },
    ],
  },
  {
    peptideSlug: "tb-500",
    legacyId: "tb-actin",
    title: "Actin Polymerization and Cell Migration",
    excerpt:
      "How TB-500 regulates actin polymerization to promote cellular migration, a key mechanism underlying its tissue repair capabilities.",
    topic: "Cell Biology",
    date: "2023-12-14",
    readTime: "8 min read",
    studies: [],
  },
  {
    peptideSlug: "tb-500",
    legacyId: "tb-cardiac",
    title: "Cardiac Repair Research with Thymosin Beta-4",
    excerpt:
      "Investigating TB-500's potential in cardiac tissue repair, including cardiomyocyte survival, reduction of scar tissue, and improvement of cardiac function in research models.",
    topic: "Regeneration",
    date: "2023-11-22",
    readTime: "11 min read",
    studies: [],
  },
  {
    peptideSlug: "tb-500",
    legacyId: "tb-protocol",
    title: "TB-500 Reconstitution & Handling Guide",
    excerpt:
      "Standard protocols for reconstituting TB-500, proper storage conditions, and best practices for maintaining peptide integrity in laboratory settings.",
    topic: "Protocols",
    date: "2023-10-04",
    readTime: "3 min read",
    studies: [],
  },
];

// ── MDX stub builder ────────────────────────────────────────────────────────

function buildPlaceholderMdx(paper: PaperSeed): string {
  const studiesBlock =
    paper.studies.length > 0
      ? `\n\n## References\n\n${paper.studies
          .map(
            (s) =>
              `- <Citation authors="${s.authors}" year="${s.year}" title="${s.title.replace(/"/g, '\\"')}" url="${s.url}" /> (PMID: <PubMedLink pmid="${s.pmid}" />)`,
          )
          .join("\n")}`
      : "";

  return `## Overview\n\n${paper.excerpt}\n\n<Callout tone="info" title="Research use only">\n  All content in this library is intended for licensed researchers working in a laboratory setting. Nothing here is medical advice.\n</Callout>${studiesBlock}\n\n## Notes\n\nThis paper has been imported from the legacy static research library. The full write-up will be added through the admin panel.\n`;
}

function roughReadingTimeMinutes(source: string): number {
  const words = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|[\]()]/g, " ")
    .trim()
    .split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return minutes;
}

// ── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding research tables…");

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;

    // Upsert peptides
    const peptideIdBySlug = new Map<string, string>();
    for (const peptide of PEPTIDES) {
      const rows = await txSql<{ id: string }[]>`
        insert into research_peptides
          (slug, name, full_name, sequence, description, molecular_weight, cas, product_slug, tags, sort_order, status)
        values
          (${peptide.slug}, ${peptide.name}, ${peptide.fullName ?? null}, ${peptide.sequence}, ${peptide.description}, ${peptide.molecularWeight ?? null}, ${peptide.cas ?? null}, ${peptide.productSlug ?? null}, ${JSON.stringify(peptide.tags)}::jsonb, ${peptide.sortOrder}, 'published')
        on conflict (slug) do update set
          name = excluded.name,
          full_name = excluded.full_name,
          sequence = excluded.sequence,
          description = excluded.description,
          molecular_weight = excluded.molecular_weight,
          cas = excluded.cas,
          product_slug = excluded.product_slug,
          tags = excluded.tags,
          sort_order = excluded.sort_order,
          updated_at = now()
        returning id
      `;
      peptideIdBySlug.set(peptide.slug, rows[0].id);
      console.log(`  peptide ${peptide.slug}`);
    }

    // Upsert papers
    for (const paper of PAPERS) {
      const slug = slugify(paper.title);
      const mdx = buildPlaceholderMdx(paper);
      const readingMinutes = roughReadingTimeMinutes(mdx);
      const publicationDate = new Date(paper.date);

      const rows = await txSql<{ id: string }[]>`
        insert into research_papers
          (slug, title, excerpt, authors, publication_date, mdx_content, reading_time_minutes, topics, status, published_at)
        values
          (${slug}, ${paper.title}, ${paper.excerpt}, ${JSON.stringify([{ name: "Revalin Research Team" }])}::jsonb, ${publicationDate.toISOString()}, ${mdx}, ${readingMinutes}, ${JSON.stringify([paper.topic])}::jsonb, 'published', now())
        on conflict (slug) do update set
          title = excluded.title,
          excerpt = excluded.excerpt,
          authors = excluded.authors,
          publication_date = excluded.publication_date,
          mdx_content = excluded.mdx_content,
          reading_time_minutes = excluded.reading_time_minutes,
          topics = excluded.topics,
          status = excluded.status,
          updated_at = now()
        returning id
      `;
      const paperId = rows[0].id;

      const peptideId = peptideIdBySlug.get(paper.peptideSlug);
      if (!peptideId) {
        console.warn(`  ! paper "${paper.title}" has unknown peptide slug ${paper.peptideSlug}`);
        continue;
      }

      await txSql`
        insert into research_paper_peptides (paper_id, peptide_id, sort_order)
        values (${paperId}, ${peptideId}, 0)
        on conflict (paper_id, peptide_id) do nothing
      `;
      console.log(`  paper ${slug}`);
    }
  });

  console.log("Done.");
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  sql.end().finally(() => process.exit(1));
});
