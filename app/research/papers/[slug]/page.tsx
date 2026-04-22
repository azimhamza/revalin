import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageLayout } from "@/components/layout/page-layout";
import { getServerSession } from "@/lib/auth-server";
import {
  getPaperBySlug,
  listPublishedPapers,
  listRelatedPapers,
} from "@/lib/research/queries";
import { renderMdx, renderMdxHtml } from "@/lib/research/mdx";
import { getSiteUrl, resolveSiteUrl } from "@/lib/site";

import { PaperHero } from "./components/paper-hero";
import { PaperMeta } from "./components/paper-meta";
import { PaperPeptideChips } from "./components/paper-peptide-chips";
import { RelatedPapers } from "./components/related-papers";
import { ResearchDisclaimerFooter } from "./components/research-disclaimer-footer";

export const revalidate = 3600;

const SITE_URL = getSiteUrl();

export async function generateStaticParams() {
  try {
    const papers = await listPublishedPapers({ limit: 500 });
    return papers.map((p) => ({ slug: p.slug }));
  } catch (error) {
    console.error("[research] generateStaticParams failed", error);
    return [];
  }
}

type PaperPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

async function isAdminSession() {
  const session = await getServerSession();
  return Boolean(session?.user && (session.user as any).role === "admin");
}

export async function generateMetadata({
  params,
  searchParams,
}: PaperPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === "1";
  const admin = isPreview ? await isAdminSession() : false;

  const result = await getPaperBySlug(slug, { preview: admin });
  if (!result) return {};

  const paper = result;
  const canonical = paper.canonicalUrl ?? `/research/papers/${paper.slug}`;
  const title = paper.seoTitle ?? `${paper.title} | Revalin Research`;
  const description = paper.seoDescription ?? paper.excerpt ?? undefined;
  const imageUrl = paper.ogImageUrl ?? paper.heroImageUrl ?? undefined;
  const topics = [
    ...((paper.topics as string[]) ?? []),
    ...paper.peptides.map((p) => p.name),
  ];

  return {
    title,
    description,
    keywords: topics.length > 0 ? topics : undefined,
    alternates: {
      canonical,
    },
    robots: admin
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      publishedTime: paper.publishedAt
        ? new Date(paper.publishedAt).toISOString()
        : undefined,
      modifiedTime: paper.updatedAt
        ? new Date(paper.updatedAt).toISOString()
        : undefined,
      authors: paper.authors?.map((a) => a.name) ?? [],
      tags: topics,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: paper.heroImageAlt ?? paper.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PaperPage({
  params,
  searchParams,
}: PaperPageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === "1";
  const admin = isPreview ? await isAdminSession() : false;

  const result = await getPaperBySlug(slug, { preview: admin });
  if (!result) notFound();

  const paper = result;
  const peptideIds = paper.peptides.map((p) => p.id);

  let content: Awaited<ReturnType<typeof renderMdx>> = null;
  let contentHtml: string | null = null;
  let mdxError: string | null = null;
  try {
    if (process.env.NODE_ENV === "development") {
      contentHtml = await renderMdxHtml(paper.mdxContent);
    } else {
      content = await renderMdx(paper.mdxContent);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[research/papers] MDX render failed for slug=${paper.slug}:`,
      message,
    );
    if (err instanceof Error && err.stack) console.error(err.stack);
    mdxError = message;
  }

  const related = await listRelatedPapers(paper.id, peptideIds, 3);

  const canonicalUrl = resolveSiteUrl(
    paper.canonicalUrl ?? `/research/papers/${paper.slug}`,
  );
  const imageUrl = paper.ogImageUrl ?? paper.heroImageUrl ?? undefined;

  const scholarlyJsonLd = {
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: paper.title,
    description: paper.excerpt ?? undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: paper.publishedAt
      ? new Date(paper.publishedAt).toISOString()
      : undefined,
    dateModified: paper.updatedAt
      ? new Date(paper.updatedAt).toISOString()
      : undefined,
    author:
      paper.authors && paper.authors.length > 0
        ? paper.authors.map((a) => ({
            "@type": "Person",
            name: a.name,
            affiliation: a.affiliation,
            identifier: a.orcid,
          }))
        : [{ "@type": "Organization", name: "Revalin Research Team" }],
    publisher: {
      "@type": "Organization",
      name: "Revalin",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.svg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    ...(paper.doi
      ? { citation: `https://doi.org/${paper.doi}` }
      : {}),
    ...(paper.externalUrl ? { sameAs: paper.externalUrl } : {}),
  };

  const firstPeptide = paper.peptides[0];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Research",
        item: `${SITE_URL}/research`,
      },
      ...(firstPeptide
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: firstPeptide.name,
              item: `${SITE_URL}/research/${firstPeptide.slug}`,
            },
            {
              "@type": "ListItem",
              position: 4,
              name: paper.title,
              item: canonicalUrl,
            },
          ]
        : [
            {
              "@type": "ListItem",
              position: 3,
              name: paper.title,
              item: canonicalUrl,
            },
          ]),
    ],
  };

  return (
    <PageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(scholarlyJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {admin && paper.status !== "published" ? (
        <div className="px-sides pt-6">
          <div className="mx-auto max-w-[1600px] border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-amber-700">
            Preview · status: {paper.status}
          </div>
        </div>
      ) : null}

      <PaperHero
        title={paper.title}
        subtitle={paper.subtitle}
        heroImageUrl={paper.heroImageUrl}
        heroImageAlt={paper.heroImageAlt}
        topics={(paper.topics as string[]) ?? []}
      />

      <PaperMeta
        authors={paper.authors ?? []}
        publicationDate={paper.publicationDate}
        readingTimeMinutes={paper.readingTimeMinutes}
        doi={paper.doi}
        externalUrl={paper.externalUrl}
      />

      <article className="prose prose-revalin mx-auto mt-12 max-w-[72ch] px-sides text-[#0B2E2F] prose-headings:text-[#0B2E2F] prose-headings:tracking-[-0.03em] prose-p:text-[#0B2E2F]/80 prose-a:text-[#0B2E2F] prose-a:underline prose-strong:text-[#0B2E2F] prose-blockquote:border-l-[#0B2E2F]/20 prose-blockquote:text-[#0B2E2F]/72 prose-code:text-[#0B2E2F] prose-hr:border-[#0B2E2F]/12">
        {mdxError ? (
          admin ? (
            <div className="not-prose rounded-md border border-red-500/40 bg-red-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                MDX render error (admin only)
              </p>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-700">
                {mdxError}
              </pre>
            </div>
          ) : (
            <p className="text-[#0B2E2F]/55">
              This paper is temporarily unavailable.
            </p>
          )
        ) : contentHtml !== null ? (
          <div
            className="contents"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        ) : content ?? (
          <p className="text-[#0B2E2F]/55">
            This paper does not have content yet.
          </p>
        )}
      </article>

      <PaperPeptideChips peptides={paper.peptides} />
      <RelatedPapers papers={related} />
      <ResearchDisclaimerFooter />

      <div className="h-16" />
    </PageLayout>
  );
}
