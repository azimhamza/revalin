import { use } from 'react';
import { LogoSvg } from './header/logo-svg';
import { ShopLinks } from './shop-links';
import { EmailCapture } from '../home/email-capture';
import { getCollections } from '@/lib/swell';
import Link from 'next/link';
import { SITE_LEGAL_ROUTES, SITE_PRIMARY_ROUTES, SITE_SECONDARY_ROUTES } from '@/lib/app-routes';

export function Footer() {
  const collections = use(getCollections());
  const footerLinks = [...SITE_PRIMARY_ROUTES.slice(2), ...SITE_SECONDARY_ROUTES, ...SITE_LEGAL_ROUTES];
  const disclaimer = (
    <>
      Revalin products are for research purposes only. Not for human consumption or clinical use. The buyer is responsible for adhering to all local laws and regulations. Revalin is not a pharmacy and does not provide medical advice, prescriptions, or consultations.
    </>
  );

  return (
    <footer className="p-sides">
      <div className="w-full md:min-h-[532px] p-sides py-8 md:p-11 text-background rounded-[12px] flex flex-col justify-between max-md:gap-8" style={{ backgroundColor: '#0B2E2F' }}>
        <div className="flex flex-col justify-between md:flex-row">
          <LogoSvg className="md:basis-3/4 max-md:w-full max-w-[1200px] h-auto block" />
          <div className="max-md:hidden md:max-w-[360px] md:flex md:flex-col md:items-end">
            <ShopLinks collections={collections} align="right" className="w-full" />
            <div className="mt-4 w-full flex justify-end">
              <EmailCapture />
            </div>
            <p className="mt-2 text-xs opacity-60 text-right">support@revalin.ca</p>
            <p className="mt-5 text-sm 2xl:text-base leading-tight opacity-70 text-right">
              {disclaimer}
            </p>
          </div>
          <span className="mt-3 italic font-semibold md:hidden">Research-grade chemicals. &gt;99% purity. Third-party tested.</span>
          <p className="mt-4 text-sm leading-tight opacity-70 md:hidden">{disclaimer}</p>
          <div className="mt-4 md:hidden flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {footerLinks.map((link) => (
              <Link key={link.href} className="underline underline-offset-4" href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 md:hidden">
            <EmailCapture />
          </div>
        </div>
        <div className="flex justify-between max-md:contents opacity-70">
          <div className="max-md:mt-4 md:text-right">
            <div className="hidden md:flex justify-end flex-wrap gap-x-4 gap-y-1 text-sm mb-1">
              {footerLinks.map((link) => (
                <Link key={link.href} className="underline underline-offset-4" href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
            <p className="text-base">{new Date().getFullYear()}© — All rights reserved</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
