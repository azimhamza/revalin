// Store catalog constants
export const storeCatalog = {
  ids: 'all-products',
  rootCategoryId: 'all-products',
};

export const FALLBACK_COLLECTIONS = [
  {
    id: 'metabolic-peptides',
    handle: 'metabolic-peptides',
    title: 'Metabolic',
    description: 'Metabolic research peptides and triple-agonist compounds.',
  },
  {
    id: 'somatotropic-peptides',
    handle: 'somatotropic-peptides',
    title: 'Somatotropic',
    description: 'Growth-hormone axis compounds for in-vitro and pre-clinical work.',
  },
  {
    id: 'regenerative-peptides',
    handle: 'regenerative-peptides',
    title: 'Regenerative',
    description: 'Repair, recovery, and tissue-research compounds.',
  },
  {
    id: 'endocrine-peptides',
    handle: 'endocrine-peptides',
    title: 'Endocrine',
    description: 'Endocrine signaling compounds for qualified laboratory buyers.',
  },
  {
    id: 'melanocortin-compounds',
    handle: 'melanocortin-compounds',
    title: 'Melanocortin',
    description: 'Melanocortin-pathway compounds for research environments.',
  },
  {
    id: 'reconstitution-supplies',
    handle: 'reconstitution-supplies',
    title: 'Reconstitution',
    description: 'Water and handling supplies for peptide preparation workflows.',
  },
] as const;

export const sortOptions = [
  { label: 'Price-Low', value: 'price-asc' },
  { label: 'Price-High', value: 'price-desc' },
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
];

export const DEFAULT_PAGE_SIZE = 24;

export const DEFAULT_SORT_KEY = 'RELEVANCE';
