import { z } from "zod";

const authorSchema = z.object({
  name: z.string().trim().min(1, "Author name is required"),
  affiliation: z.string().trim().optional(),
  orcid: z.string().trim().optional(),
});

const trimmedString = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

const optionalUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const createPaperSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(256)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
  title: z.string().trim().min(1, "Title is required").max(500),
  subtitle: trimmedString(500),
  excerpt: trimmedString(2000),
  heroImageUrl: optionalUrl,
  heroImageAlt: trimmedString(500),
  authors: z.array(authorSchema).default([]),
  publicationDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  doi: trimmedString(256),
  externalUrl: optionalUrl,
  mdxContent: z.string().default(""),
  topics: z.array(z.string().trim().min(1)).default([]),
  peptideIds: z.array(z.string().uuid()).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  seoTitle: trimmedString(500),
  seoDescription: trimmedString(1000),
  ogImageUrl: optionalUrl,
  canonicalUrl: optionalUrl,
});

export const updatePaperSchema = createPaperSchema.partial();

export type CreatePaperInput = z.infer<typeof createPaperSchema>;
export type UpdatePaperInput = z.infer<typeof updatePaperSchema>;

export const createPeptideSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(128)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
  name: z.string().trim().min(1, "Name is required").max(128),
  fullName: trimmedString(256),
  sequence: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  molecularWeight: trimmedString(64),
  cas: trimmedString(64),
  productSlug: trimmedString(128),
  heroImageUrl: optionalUrl,
  heroImageAlt: trimmedString(500),
  tags: z.array(z.string().trim().min(1)).default([]),
  sortOrder: z.coerce.number().int().default(0),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  seoTitle: trimmedString(500),
  seoDescription: trimmedString(1000),
});

export const updatePeptideSchema = createPeptideSchema.partial();

export type CreatePeptideInput = z.infer<typeof createPeptideSchema>;
export type UpdatePeptideInput = z.infer<typeof updatePeptideSchema>;
