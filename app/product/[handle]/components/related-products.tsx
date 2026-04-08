import { use } from 'react';
import { getRelatedProducts } from '@/lib/swell';
import { Product } from '@/lib/swell/types';
import { ProductCard } from '@/app/shop/components/product-card';

export function RelatedProducts({
  product,
  currencyCode,
  className,
}: {
  product: Product;
  currencyCode?: string;
  className?: string;
}) {
  const related = use(getRelatedProducts(product, 4, currencyCode));

  if (related.length === 0) return null;

  return (
    <section className={className}>
      <p className="px-3 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-[#F4F1EA] bg-[#0B2E2F]">
        Also Explored by Researchers
      </p>
      <div className="grid grid-cols-2">
        {related.map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
