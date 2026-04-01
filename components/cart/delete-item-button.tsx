'use client';

import { useState } from 'react';
import { CartItem } from '@/lib/swell/types';
import { Button } from '../ui/button';
import { useCart } from './cart-context';
import { RemoveItemConfirmation } from './remove-item-confirmation';

export function DeleteItemButton({ item }: { item: CartItem }) {
  const { updateItem, isPending } = useCart();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const lineId = item.id;
  const merchandiseId = item.merchandise.id;

  return (
    <>
      <form
        className="-mr-0.5 -mb-0.5 opacity-70"
        onSubmit={e => {
          e.preventDefault();
          setIsConfirmOpen(true);
        }}
      >
        <Button type="submit" size="sm" variant="ghost" aria-label="Remove item" className="h-6 px-1 text-[11px]">
          Remove
        </Button>
      </form>

      <RemoveItemConfirmation
        open={isConfirmOpen}
        productTitle={item.merchandise.product.title}
        isPending={isPending}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          updateItem(lineId, merchandiseId, 0, 'delete');
          try {
            window.op?.track('product_removed_from_cart', {
              productHandle: item.merchandise.product.handle,
              productTitle: item.merchandise.product.title,
            });
          } catch {}
          setIsConfirmOpen(false);
        }}
      />
    </>
  );
}
