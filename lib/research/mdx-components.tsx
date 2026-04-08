import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type FigureProps = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
};

function Figure({ src, alt, caption, width = 1280, height = 720 }: FigureProps) {
  return (
    <figure className="my-8">
      <div className="relative w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
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
  if (!src || typeof src !== "string") return null;
  const w = typeof width === "number" ? width : Number(width) || 1280;
  const h = typeof height === "number" ? height : Number(height) || 720;
  return (
    <Image
      src={src}
      alt={alt}
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
