import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import remarkCustomHeadingId from "remark-custom-heading-id";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import readingTime from "reading-time";

import { mdxComponents, mdxPreviewComponents } from "./mdx-components";

const prettyCodeOptions = {
  theme: "github-dark-dimmed",
  keepBackground: true,
} as const;

const sharedMdxOptions = {
  parseFrontmatter: false,
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkCustomHeadingId],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [rehypePrettyCode, prettyCodeOptions],
    ],
  },
} as const;

/**
 * Compile an MDX string to a React node (RSC). Rendering happens on the
 * server; the returned node can be streamed directly into an RSC tree.
 */
export async function renderMdx(source: string) {
  if (!source) return null;

  const { content } = await compileMDX({
    source,
    components: mdxComponents as any,
    options: sharedMdxOptions as any,
  });

  return content;
}

/**
 * Variant for the admin live preview. Uses plain <a>/<img> instead of
 * next/link and next/image so the legacy (non-RSC) `renderToStaticMarkup`
 * renderer used by the preview API can traverse the tree without hitting
 * client-component boundaries.
 */
export async function renderMdxPreview(source: string) {
  if (!source) return null;

  const { content } = await compileMDX({
    source,
    components: mdxPreviewComponents as any,
    options: sharedMdxOptions as any,
  });

  return content;
}

/**
 * Development-only article renderer.
 *
 * `next-mdx-remote/rsc` returns dynamically compiled React elements that can
 * miss the dev-only debug stack metadata expected by Next's RSC serializer when
 * `experimental.useCache` is enabled. Rendering those elements to static HTML
 * keeps local article pages debuggable without changing the production path.
 */
export async function renderMdxHtml(source: string): Promise<string | null> {
  const content = await renderMdxPreview(source);
  if (!content) return null;

  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(content);
}

/**
 * Rough reading-time calculation. Strips common MDX syntax tokens before
 * counting so component tags and code fences don't inflate the estimate.
 */
export function calculateReadingTime(source: string): number {
  if (!source) return 0;
  const stripped = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  const { minutes } = readingTime(stripped);
  return Math.max(1, Math.round(minutes));
}
