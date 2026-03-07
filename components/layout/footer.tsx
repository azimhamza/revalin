import { LogoSvg } from './header/logo-svg';
import { ShopLinks } from './shop-links';
import { SidebarLinks } from './sidebar/product-sidebar-links';
import { getCollections } from '@/lib/shopify';

export async function Footer() {
  const collections = await getCollections();
  const disclaimer = (
    <>
      Revalin products are for research purposes only. Not for human consumption or clinical use. The buyer is responsible for adhering to all local laws and regulations. Revalin is not a pharmacy and does not provide medical advice, prescriptions, or consultations.
    </>
  );

  return (
    <footer className="p-sides">
      <div className="w-full md:h-[532px] p-sides md:p-11 text-background rounded-[12px] flex flex-col justify-between max-md:gap-8" style={{ backgroundColor: '#0B2E2F' }}>
        <div className="flex flex-col justify-between md:flex-row">
          <LogoSvg className="md:basis-3/4 max-md:w-full max-w-[1200px] h-auto block" />
          <div className="max-md:hidden md:max-w-[360px] md:flex md:flex-col md:items-end">
            <ShopLinks collections={collections} align="right" className="w-full" />
            <p className="mt-5 text-sm 2xl:text-base leading-tight opacity-70 text-right">
              {disclaimer}
            </p>
          </div>
          <span className="mt-3 italic font-semibold md:hidden">Research-grade peptides. &gt;99% purity. Third-party tested.</span>
          <p className="mt-4 text-sm leading-tight opacity-70 md:hidden">{disclaimer}</p>
        </div>
        <div className="flex justify-between max-md:contents opacity-70">
          <SidebarLinks className="max-w-[450px] w-full max-md:flex-col" size="base" invert />
          <p className="text-base">{new Date().getFullYear()}© — All rights reserved</p>
        </div>
      </div>
    </footer>
  );
}
