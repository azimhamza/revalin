'use client';

import MobileMenu from './mobile-menu';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LogoSvg } from './logo-svg';
import CartModal from '@/components/cart/modal';
import { UserMenuNav, UserMenuMobile } from './user-menu';
import { SITE_PRIMARY_ROUTES } from '@/lib/app-routes';
import { Collection } from '@/lib/swell/types';
import { BadgeCheck, Droplets, Truck, Package } from 'lucide-react';
import { IntentLink } from '@/components/navigation/intent-link';

const BANNER_ITEMS = [
  { icon: BadgeCheck, text: 'Independently Verified' },
  { icon: Droplets, text: '>99% Purity' },
  { icon: Truck, text: 'Same-Day Dispatch' },
  { icon: Package, text: 'Free Shipping $250+' },
  { text: 'Research Use Only' },
  { text: 'User Discretion Advised' },
];

export const navItems = SITE_PRIMARY_ROUTES;

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface HeaderProps {
  collections: Collection[];
}

export function Header({ collections }: HeaderProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Scrolling Banner */}
      <div
        className="fixed left-0 z-50 w-full overflow-hidden border-b border-foreground/10 backdrop-blur-sm"
        style={{
          top: 'var(--revalin-pending-banner-height, 0px)',
          backgroundColor: '#0B2E2F',
        }}
      >
        <div className="banner-scroll flex w-max items-center gap-6 py-1.5 md:gap-8">
          {[...BANNER_ITEMS, ...BANNER_ITEMS].map((item, i) => (
            <span key={i} className="flex shrink-0 items-center gap-1.5 text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.14em] text-background/90 font-medium uppercase">
              {item.icon && <item.icon className="size-3 md:size-3.5 opacity-80" strokeWidth={1.5} />}
              {item.text}
            </span>
          ))}
        </div>
        <style jsx>{`
          .banner-scroll {
            animation: banner-marquee 20s linear infinite;
          }
          @keyframes banner-marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>

      {/* Main Header */}
      <header
        className="fixed left-0 z-50 grid w-full grid-cols-3 items-start p-sides [--revalin-site-header-base-top:28px] md:grid-cols-12 md:gap-sides md:[--revalin-site-header-base-top:30px]"
        style={{
          top: 'calc(var(--revalin-pending-banner-height, 0px) + var(--revalin-site-header-base-top))',
        }}
      >
        <div className="block flex-none md:hidden">
          <MobileMenu collections={collections} />
        </div>
        <IntentLink href="/" className="md:col-span-3 xl:col-span-2">
          <LogoSvg className="w-auto h-6 max-md:place-self-center md:w-full md:h-auto max-w-96" />
        </IntentLink>
        <nav className="flex gap-2 justify-end items-center md:col-span-9 xl:col-span-10">
          <ul className="items-center gap-5 py-0.5 px-3 bg-background/10 rounded-sm backdrop-blur-md hidden md:flex">
            {navItems.map(item => (
              <li key={item.href}>
                <IntentLink
                  href={item.href}
                  className={cn(
                    'font-semibold text-base transition-colors duration-200 uppercase',
                    isActivePath(pathname, item.href)
                      ? 'text-foreground'
                      : 'text-foreground/50'
                  )}
                >
                  {item.label}
                </IntentLink>
              </li>
            ))}
            <li>
              <UserMenuNav />
            </li>
          </ul>
          <UserMenuMobile />
          <CartModal />
        </nav>
      </header>
    </>
  );
}
