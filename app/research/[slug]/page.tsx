import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { PageLayout } from '@/components/layout/page-layout';
import {
  getPeptideBySlug,
  listPeptides,
  type ResearchPaperSummary,
} from '@/lib/research/queries';

import {
  PeptideProvider,
  type PeptideData,
  type Article,
} from './providers/peptide-provider';
import { PeptideDesktopFilters } from './components/peptide-filters';
import { PeptideMobileFilters } from './components/peptide-mobile-filters';
import { ArticleListContent } from './components/article-list-content';

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const peptides = await listPeptides();
    return peptides.map((peptide) => ({ slug: peptide.slug }));
  } catch (error) {
    console.error('[research] generateStaticParams peptides failed', error);
    return [];
  }
}

function summaryToArticle(summary: ResearchPaperSummary): Article {
  return {
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    excerpt: summary.excerpt ?? '',
    topic: summary.topics[0] ?? 'General',
    date: summary.publishedAt
      ? new Date(summary.publishedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
        })
      : '',
    readTime: summary.readingTimeMinutes
      ? `${summary.readingTimeMinutes} min read`
      : '',
    heroImageUrl: summary.heroImageUrl,
    heroImageAlt: summary.heroImageAlt,
    peptides: summary.peptides.map((p) => ({ slug: p.slug, name: p.name })),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPeptideBySlug(slug);
  if (!result) return {};

  const { peptide } = result;
  return {
    title:
      peptide.seoTitle ?? `${peptide.name} Research - Peptide Studies & Protocols`,
    description:
      peptide.seoDescription ?? peptide.description ?? undefined,
    alternates: {
      canonical: `/research/${slug}`,
    },
    openGraph: peptide.heroImageUrl
      ? {
          images: [
            {
              url: peptide.heroImageUrl,
              alt: peptide.heroImageAlt ?? peptide.name,
            },
          ],
        }
      : undefined,
  };
}

export default async function PeptidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPeptideBySlug(slug);

  if (!result) {
    notFound();
  }

  const { peptide, papers } = result;

  const peptideData: PeptideData = {
    name: peptide.name,
    fullName: peptide.fullName ?? peptide.name,
    slug: peptide.slug,
    sequence: peptide.sequence ?? '',
    description: peptide.description ?? '',
    molecularWeight: peptide.molecularWeight ?? '',
    cas: peptide.cas ?? '',
    productSlug: peptide.productSlug ?? '',
    heroImageUrl: peptide.heroImageUrl,
    heroImageAlt: peptide.heroImageAlt,
  };

  const articles = papers.map(summaryToArticle);

  return (
    <PageLayout>
      <PeptideProvider peptide={peptideData} articles={articles}>
        <div className="flex flex-col md:grid grid-cols-12 md:gap-sides">
          <PeptideDesktopFilters className="col-span-3 max-md:hidden" />
          <PeptideMobileFilters />
          <div className="col-span-9 flex flex-col md:h-full md:pt-top-spacing">
            <PeptideHeroBlock peptide={peptideData} />
            <div className="mt-10 border-t border-[#0B2E2F]/12 pt-10 md:mt-12 md:pt-12">
              <ArticleListContent />
            </div>
          </div>
        </div>
      </PeptideProvider>
    </PageLayout>
  );
}

function PeptideHeroBlock({ peptide }: { peptide: PeptideData }) {
  const stats = [
    { label: 'Sequence', value: peptide.sequence || '—', mono: true },
    { label: 'Molecular weight', value: peptide.molecularWeight || '—' },
    { label: 'CAS', value: peptide.cas || '—' },
  ];

  return (
    <section className="px-sides text-[#0B2E2F] md:px-0 md:pr-sides">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[#0B2E2F]/55">
        Compound profile
      </p>
      <h1 className="mt-3 max-w-3xl text-balance text-3xl tracking-[-0.05em] md:text-[3.1rem] md:leading-[0.95]">
        {peptide.name}
      </h1>
      {peptide.fullName && peptide.fullName !== peptide.name ? (
        <p className="mt-2 text-sm uppercase tracking-[0.18em] text-[#0B2E2F]/55">
          {peptide.fullName}
        </p>
      ) : null}

      {peptide.description ? (
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#0B2E2F]/72 md:text-base">
          {peptide.description}
        </p>
      ) : null}

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 p-4"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
              {stat.label}
            </p>
            <p
              className={`mt-3 text-base leading-tight tracking-[-0.02em] text-[#0B2E2F] ${
                stat.mono ? 'font-mono break-all' : ''
              }`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {peptide.heroImageUrl ? (
        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden bg-[#EBE7DC]">
          <Image
            src={peptide.heroImageUrl}
            alt={peptide.heroImageAlt ?? peptide.name}
            fill
            sizes="(max-width: 1600px) 100vw, 1200px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}
    </section>
  );
}
