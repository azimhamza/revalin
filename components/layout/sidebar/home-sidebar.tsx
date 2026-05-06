import { ShopLinks } from '../shop-links';
import { Collection } from '@/lib/swell/types';

interface HomeSidebarProps {
  collections: Collection[];
}

export function HomeSidebar({ collections }: HomeSidebarProps) {
  return (
    <aside className="max-md:hidden col-span-4 h-screen sticky top-0 p-sides pt-top-spacing flex flex-col justify-between pb-8">
      <div>
        <p className="italic tracking-tighter text-base">Research Chemicals You Can Trust.</p>

        <div className="mt-5 text-base leading-tight">
          <p>Certificate of Analysis on every batch.</p>
          <p>&gt;99% purity, tested by Janoshik Analytical.</p>
        </div>

        <div className="mt-5 text-base leading-tight">
          <p>Same-day shipping. Free insurance.</p>
          <p>COAs included — no request form, no gatekeeping.</p>
        </div>

        <p className="mt-5 text-sm text-muted-foreground tracking-wide">Proudly Canadian.</p>
      </div>

      <ShopLinks collections={collections} label="Shop All" showArrow shopAllHref="/shop" />
    </aside>
  );
}
