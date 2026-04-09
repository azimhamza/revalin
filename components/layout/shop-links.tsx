import { Collection } from '@/lib/swell/types';
import { cn } from '@/lib/utils';
import { FALLBACK_COLLECTIONS } from '@/lib/swell/constants';
import { IntentLink } from '@/components/navigation/intent-link';

type LinkCollection = Pick<Collection, 'handle' | 'title'>;

interface ShopLinksProps {
  collections: LinkCollection[];
  align?: 'left' | 'right';
  label?: string;
  className?: string;
}

export function ShopLinks({ collections, label = 'Shop', align = 'left', className }: ShopLinksProps) {
  // Keep category navigation usable when the storefront categories request fails or returns an empty cache entry.
  const items = collections.length > 0 ? collections : FALLBACK_COLLECTIONS;

  return (
    <div className={cn(align === 'right' ? 'text-right' : 'text-left', className)}>
      <h4 className="text-lg font-extrabold md:text-xl">{label}</h4>

      <ul className="flex flex-col gap-1.5 leading-5 mt-5">
        {items.map((item, index) => (
          <li key={`${item.handle}-${index}`}>
            <IntentLink href={`/shop/${item.handle}`}>
              {item.title}
            </IntentLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
