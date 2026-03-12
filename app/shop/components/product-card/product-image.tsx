'use client';

import { useProductImages, useSelectedVariant } from '@/components/products/variant-selector';
import { BlurUpImage } from '@/components/ui/blur-up-image';
import { Product } from '@/lib/swell/types';
import { getImageBlurDataURL } from '@/lib/swell/utils';

export const ProductImage = ({ product }: { product: Product }) => {
  const selectedVariant = useSelectedVariant(product);

  const [variantImage] = useProductImages(product, selectedVariant?.selectedOptions);
  const image = variantImage || product.featuredImage;
  const imageUrl = image?.url || '/placeholder.jpg';
  const width = image?.width || 600;
  const height = image?.height || 600;
  const alt = image?.altText || product.title;

  return (
    <BlurUpImage
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      className="object-cover size-full"
      quality={100}
      placeholder="blur"
      blurDataURL={getImageBlurDataURL(image?.thumbhash)}
    />
  );
};
