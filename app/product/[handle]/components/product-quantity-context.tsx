'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type ProductQuantityContextType = {
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
};

const ProductQuantityContext = createContext<ProductQuantityContextType>({
  quantity: 1,
  setQuantity: () => {},
});

export function ProductQuantityProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const quantityParam = Number(searchParams.get('qty'));
    if (!Number.isFinite(quantityParam) || quantityParam < 1) {
      setQuantity(1);
      return;
    }

    setQuantity(Math.floor(quantityParam));
  }, [searchParams]);

  return (
    <ProductQuantityContext.Provider value={{ quantity, setQuantity }}>
      {children}
    </ProductQuantityContext.Provider>
  );
}

export function useProductQuantity() {
  return useContext(ProductQuantityContext);
}
