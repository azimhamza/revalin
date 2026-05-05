'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import clsx from 'clsx';
import { CartItem } from '@/lib/swell/types';
import { useCart } from './cart-context';
import { RemoveItemConfirmation } from './remove-item-confirmation';

function SubmitButton({ disabled, type }: { disabled?: boolean; type: 'plus' | 'minus' }) {
  return (
    <button
      type="submit"
      aria-label={type === 'plus' ? 'Increase item quantity' : 'Reduce item quantity'}
      disabled={disabled}
      className={clsx(
        'ease flex h-full min-w-[24px] max-w-[24px] flex-none items-center justify-center rounded-full p-0.5 transition-all duration-200 hover:border-neutral-800 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30',
        {
          'ml-auto': type === 'minus',
        }
      )}
    >
      {type === 'plus' ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
    </button>
  );
}

export function EditItemQuantityButton({ item, type }: { item: CartItem; type: 'plus' | 'minus' }) {
  const { updateItem, isPending } = useCart();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const nextQuantity = type === 'plus' ? item.quantity + 1 : item.quantity - 1;
  const isDisabled = type === 'minus' && item.quantity <= 0;

  return (
    <>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (isDisabled) {
            return;
          }
          if (type === 'minus' && nextQuantity <= 0) {
            setIsConfirmOpen(true);
            return;
          }
          updateItem(item.id, item.merchandise.id, nextQuantity, type);
        }}
      >
        <SubmitButton disabled={isDisabled} type={type} />
      </form>

      <RemoveItemConfirmation
        open={isConfirmOpen}
        productTitle={item.merchandise.product.title}
        isPending={isPending}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          updateItem(item.id, item.merchandise.id, 0, 'delete');
          setIsConfirmOpen(false);
        }}
      />
    </>
  );
}
