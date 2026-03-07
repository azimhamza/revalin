import { ShopLinks } from '../shop-links';
import { Collection } from '@/lib/shopify/types';

interface HomeSidebarProps {
  collections: Collection[];
}

export function HomeSidebar({ collections }: HomeSidebarProps) {
  return (
    <aside className="max-md:hidden col-span-4 h-screen sticky top-0 p-sides pt-top-spacing flex flex-col justify-between">
      <div>
        <p className="italic tracking-tighter text-base">Research-grade peptides. &gt;99% purity.</p>
        <div className="mt-5 text-base leading-tight">
          <p>Third-party batch testing. COAs included.</p>
          <p>Ships same day. Free Shipping over $250.</p>
        </div>
        <div className="mt-5 text-base leading-tight">
          <p>Peptides that don&apos;t need promises, just proof.</p>
          <p>Pure chemistry, zero hype.</p>
          <p>Transparency with teeth — results over rhetoric.</p>
        </div>
      </div>
      <ShopLinks collections={collections} />
    </aside>
  );
}
