'use client';

import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

export interface BatchResult {
  compound: string;
  amount: string;
}

export interface Batch {
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
  imageUrl?: string;
}

interface COAContextType {
  batches: Batch[];
  filteredBatches: Batch[];
  selectedProduct: string;
  setSelectedProduct: (product: string) => void;
  uniqueProducts: string[];
}

const COAContext = createContext<COAContextType | undefined>(undefined);

export function COAProvider({ batches, children }: { batches: Batch[]; children: ReactNode }) {
  const [selectedProduct, setSelectedProduct] = useState('all');

  const uniqueProducts = useMemo(
    () => Array.from(new Set(batches.map((b) => b.product))),
    [batches]
  );

  const filteredBatches = useMemo(() => {
    if (selectedProduct === 'all') return batches;
    return batches.filter((batch) => batch.product === selectedProduct);
  }, [batches, selectedProduct]);

  return (
    <COAContext.Provider
      value={{
        batches,
        filteredBatches,
        selectedProduct,
        setSelectedProduct,
        uniqueProducts,
      }}
    >
      {children}
    </COAContext.Provider>
  );
}

export function useCOA() {
  const context = useContext(COAContext);
  if (context === undefined) {
    throw new Error('useCOA must be used within a COAProvider');
  }
  return context;
}
