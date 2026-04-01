export interface BatchResult {
  compound: string;
  amount: string;
}

export interface BatchData {
  id: string;
  taskNumber: string;
  sample: string;
  product: string;
  manufacturer: string;
  batch?: string;
  testingOrdered: string;
  sampleReceived: string;
  analysisDate: string;
  testRequested: string;
  results: BatchResult[];
  purity?: string;
  comments?: string;
  verificationKey: string;
  verifyUrl: string;
}

// Search terms used to match each COA product to a Swell store product handle
export const PRODUCT_MATCH_TERMS: Record<string, string[]> = {
  'GLP-3 (Triple Agonist)': ['glp-3', 'glp-3rt', 'triple-agonist'],
  Tesamorelin: ['tesamorelin'],
  'BPC-157': ['bpc-157', 'bpc157', 'bpc 157'],
  'Glow Blend': ['glow'],
  'NAD+': ['nad'],
  'CJC/Ipamorelin': ['ipamorelin', 'cjc'],
  'GHK-Cu': ['ghk-cu', 'ghk cu'],
  'ARA-290': ['ara-290', 'ara290'],
  'MOTS-C': ['mots-c', 'mots c', 'motsc'],
  'KLOW Blend': ['klow'],
  Semax: ['semax'],
};

export const COA_BATCHES: BatchData[] = [
  {
    id: '1',
    taskNumber: '105085',
    sample: 'Sample 3',
    product: 'GLP-3 (Triple Agonist)',
    manufacturer: 'Unknown',
    testingOrdered: '04 Feb 2026',
    sampleReceived: '09 Feb 2026',
    analysisDate: '12 Feb 2026',
    testRequested: 'Common GLP-1 peptide blind test',
    results: [{ compound: 'GLP-3RT', amount: '10.82 mg' }],
    purity: '99.032',
    verificationKey: 'DUV2KAX1PZAF',
    verifyUrl: 'https://www.janoshik.com/tests/105085_DUV2KAX1PZAF',
  },
  {
    id: '2',
    taskNumber: '105103',
    sample: 'Sample 10',
    product: 'Tesamorelin',
    manufacturer: 'Unknown',
    testingOrdered: '04 Feb 2026',
    sampleReceived: '09 Feb 2026',
    analysisDate: '12 Feb 2026',
    testRequested: 'Tesamorelin analysis',
    results: [{ compound: 'Tesamorelin', amount: '10.64 mg' }],
    purity: '99.478',
    verificationKey: 'Y6SN8D51SFNT',
    verifyUrl: 'https://www.janoshik.com/tests/105103_Y6SN8D51SFNT',
  },
  {
    id: '3',
    taskNumber: '78203',
    sample: 'BC10 (BPC 10mg)',
    product: 'BPC-157',
    manufacturer: 'Revalin Trusted',
    batch: '20250901',
    testingOrdered: '09 Sep 2025',
    sampleReceived: '09 Sep 2025',
    analysisDate: '11 Sep 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [{ compound: 'BPC-157', amount: '10.36 mg' }],
    purity: '99.757',
    verificationKey: 'E5SX9B2FKVMW',
    verifyUrl: 'https://www.janoshik.com/tests/78203_E5SX9B2FKVMW',
  },
  {
    id: '4',
    taskNumber: '68487',
    sample: 'glow',
    product: 'Glow Blend',
    manufacturer: 'Revalin Trusted',
    testingOrdered: '10 Jun 2025',
    sampleReceived: '17 Jun 2025',
    analysisDate: '23 Jun 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [
      { compound: 'GHK-Cu', amount: '64.12 mg' },
      { compound: 'TB-500 (TB4)', amount: '11.32 mg' },
      { compound: 'BPC-157', amount: '13.93 mg' },
    ],
    verificationKey: 'WVZ84EVZSQAT',
    verifyUrl: 'https://www.janoshik.com/tests/68487_WVZ84EVZSQAT',
  },
  {
    id: '5',
    taskNumber: '68484',
    sample: 'NAD500',
    product: 'NAD+',
    manufacturer: 'Revalin Trusted',
    testingOrdered: '10 Jun 2025',
    sampleReceived: '17 Jun 2025',
    analysisDate: '20 Jun 2025',
    testRequested: 'Qualitative and quantitative analysis of non-AAS sample.',
    results: [{ compound: 'NAD+', amount: '559.60 mg' }],
    verificationKey: 'TDS1FZICZMPY',
    verifyUrl: 'https://www.janoshik.com/tests/68484_TDS1FZICZMPY',
  },
  {
    id: '6',
    taskNumber: '105094',
    sample: 'Sample 7',
    product: 'CJC/Ipamorelin',
    manufacturer: 'Unknown',
    testingOrdered: '04 Feb 2026',
    sampleReceived: '09 Feb 2026',
    analysisDate: '12 Feb 2026',
    testRequested: 'CJC DAC/Ipamorelin blend analysis',
    results: [
      { compound: 'Ipamorelin', amount: '5.15 mg' },
      { compound: 'CJC-1295 (mod GRF 1-29)', amount: '5.99 mg' },
    ],
    verificationKey: 'N5RPCP5BF86D',
    verifyUrl: 'https://www.janoshik.com/tests/105094_N5RPCP5BF86D',
  },
  {
    id: '7',
    taskNumber: '92640',
    sample: 'ghk CU100',
    product: 'GHK-Cu',
    manufacturer: 'Revalin Trusted',
    testingOrdered: '05 Dec 2025',
    sampleReceived: '09 Dec 2025',
    analysisDate: '10 Dec 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [{ compound: 'GHK-Cu', amount: '118.01 mg' }],
    purity: '99.775',
    verificationKey: 'XIVZ3XGKE6HT',
    verifyUrl: 'https://www.janoshik.com/tests/92640_XIVZ3XGKE6HT',
  },
  {
    id: '8',
    taskNumber: '92639',
    sample: 'Ara-290',
    product: 'ARA-290',
    manufacturer: 'Revalin Trusted',
    testingOrdered: '05 Dec 2025',
    sampleReceived: '09 Dec 2025',
    analysisDate: '10 Dec 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [{ compound: 'ARA-290', amount: '11.25 mg' }],
    purity: '99.514',
    verificationKey: '25HZDEC84YUD',
    verifyUrl: 'https://www.janoshik.com/tests/92639_25HZDEC84YUD',
  },
  {
    id: '9',
    taskNumber: '105097',
    sample: 'Sample 8',
    product: 'MOTS-C',
    manufacturer: 'Unknown',
    testingOrdered: '04 Feb 2026',
    sampleReceived: '09 Feb 2026',
    analysisDate: '12 Feb 2026',
    testRequested: 'MOTS-c analysis',
    results: [{ compound: 'MOTS-C', amount: '11.76 mg' }],
    purity: '99.376',
    verificationKey: 'EB7MCX3Z2ATH',
    verifyUrl: 'https://www.janoshik.com/tests/105097_EB7MCX3Z2ATH',
  },
  {
    id: '10',
    taskNumber: '92633',
    sample: 'KLOW',
    product: 'KLOW Blend',
    manufacturer: 'Revalin Trusted',
    testingOrdered: '05 Dec 2025',
    sampleReceived: '09 Dec 2025',
    analysisDate: '11 Dec 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [
      { compound: 'GHK-Cu', amount: '59.72 mg' },
      { compound: 'BPC-157', amount: '11.80 mg' },
      { compound: 'TB-500 (TB4)', amount: '10.89 mg' },
    ],
    comments: 'KPV: 10.45 mg',
    verificationKey: 'GR3Z27DTA94S',
    verifyUrl: 'https://www.janoshik.com/tests/92633_GR3Z27DTA94S',
  },
  {
    id: '11',
    taskNumber: '78205',
    sample: 'XA10',
    product: 'Semax',
    manufacturer: 'Revalin Trusted',
    batch: '20250902',
    testingOrdered: '09 Sep 2025',
    sampleReceived: '09 Sep 2025',
    analysisDate: '11 Sep 2025',
    testRequested: 'Assessment of a peptide vial or vials.',
    results: [{ compound: 'Semax', amount: '11.76 mg' }],
    purity: '99.361',
    verificationKey: 'GI7QIV4XE7B5',
    verifyUrl: 'https://www.janoshik.com/tests/78205_GI7QIV4XE7B5',
  },
];

/**
 * Find all COA batches that match a product by handle or title.
 */
export function getBatchesForProduct(productHandle: string, productTitle: string): BatchData[] {
  const handle = productHandle.toLowerCase();
  const title = productTitle.toLowerCase();

  return COA_BATCHES.filter((batch) => {
    const terms = PRODUCT_MATCH_TERMS[batch.product];
    if (!terms) return false;
    return terms.some(
      (term) => handle.includes(term.toLowerCase()) || title.includes(term.toLowerCase())
    );
  });
}
