import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import readingTime from "reading-time";

import { mdxComponents } from "./mdx-components";

const prettyCodeOptions = {
  theme: "github-dark-dimmed",
  keepBackground: true,
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
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
          [rehypePrettyCode, prettyCodeOptions],
        ],
      },
    },
  });

  return content;
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
