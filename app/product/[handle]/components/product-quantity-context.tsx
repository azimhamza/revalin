'use client';

import { createContext, useContext, useState } from 'react';

type ProductQuantityContextType = {
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
};

const ProductQuantityContext = createContext<ProductQuantityContextType>({
  quantity: 1,
  setQuantity: () => {},
});

export function ProductQuantityProvider({ children }: { children: React.ReactNode }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <ProductQuantityContext.Provider value={{ quantity, setQuantity }}>
      {children}
    </ProductQuantityContext.Provider>
  );
}

export function useProductQuantity() {
  return useContext(ProductQuantityContext);
}
