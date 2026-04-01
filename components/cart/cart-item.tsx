'use client';

import { CartItem } from '@/lib/swell/types';
import { DEFAULT_OPTION } from '@/lib/constants';
import { createUrl, getColorHex } from '@/lib/utils';
import Link from 'next/link';
import { DeleteItemButton } from './delete-item-button';
import { EditItemQuantityButton } from './edit-item-quantity-button';
import { formatPrice, getImageBlurDataURL } from '@/lib/swell/utils';
import { ColorSwatch } from '@/components/ui/color-picker';
import { useProductImages } from '../products/variant-selector';
import { BlurUpImage } from '@/components/ui/blur-up-image';

type MerchandiseSearchParams = {
  [key: string]: string;
};

interface CartItemProps {
  item: CartItem;
  onCloseCart: () => void;
}

export function CartItemCard({ item, onCloseCart }: CartItemProps) {
  const merchandiseSearchParams = {} as MerchandiseSearchParams;

  item.merchandise.selectedOptions.forEach(({ name, value }) => {
    if (value !== DEFAULT_OPTION) {
      merchandiseSearchParams[name.toLowerCase()] = value.toLowerCase();
    }
  });

  const merchandiseUrl = createUrl(
    `/product/${item.merchandise.product.handle}`,
    new URLSearchParams(merchandiseSearchParams)
  );

  // Find color option if it exists
  const colorOption = item.merchandise.selectedOptions.find(option => option.name.toLowerCase() === 'color');

  const imgs = useProductImages(item.merchandise.product, item.merchandise.selectedOptions);

  const [renderImage] = imgs;
  const image = renderImage || item.merchandise.product.featuredImage;
  const imageUrl = image?.url || '/placeholder.jpg';
  const imageAlt = image?.altText || item.merchandise.product.title;
  const currencyCode = item.cost.totalAmount.currencyCode;
  const effectiveLineTotal = Number(item.cost.totalAmount.amount || 0);
  const baseUnitPrice = Math.max(
    Number(item.merchandise.product.compareAtPrice?.amount || 0),
    Number(item.merchandise.product.priceRange.minVariantPrice.amount || 0)
  );
  const baseLineTotal = baseUnitPrice * item.quantity;
  const lineSavings = Math.max(0, baseLineTotal - effectiveLineTotal);

  return (
    <div className="bg-popover rounded-lg p-1.5">
      <div className="flex flex-row gap-2.5">
        <div className="relative size-[68px] overflow-hidden rounded-sm shrink-0">
          <BlurUpImage
            className="size-full object-cover"
            width={136}
            height={136}
            src={imageUrl}
            alt={imageAlt}
            placeholder="blur"
            blurDataURL={getImageBlurDataURL(image?.thumbhash)}
          />

          {/* Color pill overlay */}
          {colorOption && (
            <div className="flex absolute bottom-1 left-1">
              <ColorSwatch
                color={(() => {
                  const color = getColorHex(colorOption.value);
                  return Array.isArray(color)
                    ? [
                        { name: colorOption.value, value: color[0] },
                        { name: colorOption.value, value: color[1] },
                      ]
                    : { name: colorOption.value, value: color };
                })()}
                isSelected={false}
                onColorChange={() => {}} // No-op since this is just for display
                size="sm"
                atLeastOneColorSelected={false}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <Link href={merchandiseUrl} onClick={onCloseCart} className="z-30 flex flex-col justify-center min-w-0" prefetch>
            <span className="text-xs leading-tight font-semibold">{item.merchandise.product.title}</span>
          </Link>
          <div className="flex flex-col gap-0.5">
            <p className="flex items-baseline gap-1.5 text-xs font-semibold leading-tight">
              <span>{formatPrice(item.cost.totalAmount.amount, currencyCode)}</span>
              {lineSavings > 0 ? (
                <span className="text-[11px] font-medium line-through text-foreground/40">
                  {formatPrice(baseLineTotal.toFixed(2), currencyCode)}
                </span>
              ) : null}
            </p>
            {lineSavings > 0 ? (
              <p className="text-[11px] font-medium leading-tight text-[#0B2E2F]/65">
                You save {formatPrice(lineSavings.toFixed(2), currencyCode)}
              </p>
            ) : null}
          </div>
          <div className="flex justify-between items-center mt-auto">
            <div className="flex h-6 flex-row items-center rounded-md border border-neutral-200">
              <EditItemQuantityButton item={item} type="minus" />
              <span className="w-6 text-center text-[11px]">{item.quantity}</span>
              <EditItemQuantityButton item={item} type="plus" />
            </div>
            <DeleteItemButton item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}
