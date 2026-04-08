/**
 * Minimal, dependency-free slugifier for research paper + peptide slugs.
 * Lowercases, strips diacritics, replaces non-alphanumeric with hyphens,
 * trims leading/trailing hyphens, and collapses repeats.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
