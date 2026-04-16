import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type FigureSize = "xs" | "sm" | "md" | "lg" | "full";
type FigureAlign = "left" | "center" | "right";

type FigureProps = {
  src: string;
  alt: string;
  caption?: string;
  /** Intrinsic image width for next/image (aspect ratio). Default 1280. */
  width?: number;
  /** Intrinsic image height for next/image (aspect ratio). Default 720. */
  height?: number;
  /** Rendered max-width of the figure. Default "full". */
  size?: FigureSize;
  /** Horizontal alignment within the article column. Default "center". */
  align?: FigureAlign;
};

const FIGURE_SIZE_CLASS: Record<FigureSize, string> = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  full: "max-w-full",
};

const FIGURE_ALIGN_CLASS: Record<FigureAlign, string> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
};

/** Validate an image src so a malformed value can't throw out of next/image. */
function safeImageSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed === "#" || trimmed.startsWith("javascript:")) return null;
  return trimmed;
}

/** Coerce width/height to a finite positive number, or fall back. */
function safeDim(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function Figure({
  src,
  alt,
  caption,
  width = 1280,
  height = 720,
  size = "full",
  align = "center",
}: FigureProps) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  const w = safeDim(width, 1280);
  const h = safeDim(height, 720);
  const wrapperClass = `my-8 ${FIGURE_SIZE_CLASS[size] ?? FIGURE_SIZE_CLASS.full} ${FIGURE_ALIGN_CLASS[align] ?? FIGURE_ALIGN_CLASS.center}`;
  return (
    <figure className={wrapperClass}>
      <div className="relative w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={safeSrc}
          alt={alt ?? ""}
          width={w}
          height={h}
          className="h-auto w-full object-cover"
        />
      </div>
      {caption ? (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

type CalloutTone = "info" | "warn" | "success" | "note";

function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5 text-amber-100"
      : tone === "success"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-100"
        : tone === "note"
          ? "border-border bg-muted/40 text-foreground"
          : "border-sky-500/40 bg-sky-500/5 text-sky-100";

  return (
    <aside
      className={`not-prose my-6 rounded-md border px-4 py-3 text-sm leading-relaxed ${toneClass}`}
    >
      {title ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest">
          {title}
        </p>
      ) : null}
      <div className="space-y-2">{children}</div>
    </aside>
  );
}

function Citation({
  authors,
  year,
  title,
  source,
  url,
}: {
  authors: string;
  year: string | number;
  title: string;
  source?: string;
  url?: string;
}) {
  return (
    <span className="text-sm text-muted-foreground">
      {authors} ({year}).{" "}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          {title}
        </a>
      ) : (
        title
      )}
      {source ? <em> {source}</em> : null}.
    </span>
  );
}

function PubMedLink({
  pmid,
  children,
}: {
  pmid: string | number;
  children?: ReactNode;
}) {
  const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      {children ?? `PMID ${pmid}`}
    </a>
  );
}

function MdxImg({ src, alt = "", width, height }: ComponentPropsWithoutRef<"img">) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  const w = safeDim(width, 1280);
  const h = safeDim(height, 720);
  return (
    <Image
      src={safeSrc}
      alt={alt ?? ""}
      width={w}
      height={h}
      className="my-6 h-auto w-full rounded-md"
    />
  );
}

function MdxLink({
  href = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<"a">) {
  const isExternal = /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...(rest as any)}>
      {children}
    </Link>
  );
}

function headingWithAnchor(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${level}` as const;
  return function Heading({
    className = "",
    ...rest
  }: ComponentPropsWithoutRef<typeof Tag>) {
    return (
      <Tag
        className={`scroll-mt-24 ${className}`.trim()}
        {...(rest as any)}
      />
    );
  };
}

/**
 * Explicit allowlist of components exposed to MDX source. Admins are the only
 * authors, but keeping this surface narrow still hardens against accidents.
 */
export const mdxComponents = {
  img: MdxImg,
  a: MdxLink,
  h1: headingWithAnchor(1),
  h2: headingWithAnchor(2),
  h3: headingWithAnchor(3),
  h4: headingWithAnchor(4),
  h5: headingWithAnchor(5),
  h6: headingWithAnchor(6),
  Figure,
  Callout,
  Citation,
  PubMedLink,
};

/* -----------------------------------------------------------------------------
 * Preview-safe variants
 *
 * The admin MDX preview renders via `renderToStaticMarkup`, which is the legacy
 * (non-RSC) React SSR renderer. It cannot invoke client components like
 * `next/link` or `next/image`. These preview components swap those out for
 * plain <a>/<img> so the live preview doesn't error out. The production
 * research page still uses the optimized components via `mdxComponents`.
 * ---------------------------------------------------------------------------*/

function PreviewImg({ src, alt = "", width, height }: ComponentPropsWithoutRef<"img">) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={safeSrc}
      alt={alt ?? ""}
      width={typeof width === "number" ? width : undefined}
      height={typeof height === "number" ? height : undefined}
      className="my-6 h-auto w-full rounded-md"
    />
  );
}

function PreviewLink({ href = "", children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const isExternal = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

function PreviewFigure({
  src,
  alt,
  caption,
  width = 1280,
  height = 720,
  size = "full",
  align = "center",
}: FigureProps) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  const w = safeDim(width, 1280);
  const h = safeDim(height, 720);
  const wrapperClass = `my-8 ${FIGURE_SIZE_CLASS[size] ?? FIGURE_SIZE_CLASS.full} ${FIGURE_ALIGN_CLASS[align] ?? FIGURE_ALIGN_CLASS.center}`;
  return (
    <figure className={wrapperClass}>
      <div className="relative w-full overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={safeSrc}
          alt={alt ?? ""}
          width={w}
          height={h}
          className="h-auto w-full object-cover"
        />
      </div>
      {caption ? (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export const mdxPreviewComponents = {
  ...mdxComponents,
  img: PreviewImg,
  a: PreviewLink,
  Figure: PreviewFigure,
};
