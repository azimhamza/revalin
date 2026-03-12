'use client';

import MobileMenu from './mobile-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LogoSvg } from './logo-svg';
import CartModal from '@/components/cart/modal';
import { NavItem } from '@/lib/types';
import { Collection } from '@/lib/swell/types';

export const navItems: NavItem[] = [
  {
    label: 'home',
    href: '/',
  },
  {
    label: 'shop',
    href: '/shop',
  },
  {
    label: 'research',
    href: '/research',
  },
  {
    label: 'coa',
    href: '/coa',
  },
];

interface HeaderProps {
  collections: Collection[];
}

export function Header({ collections }: HeaderProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Disclaimer Banner */}
      <div className="fixed top-0 left-0 z-50 w-full backdrop-blur-sm border-b border-foreground/10" style={{ backgroundColor: '#0B2E2F' }}>
        <p className="text-[8px] md:text-[10px] tracking-[0.05em] md:tracking-[0.2em] text-center py-1.5 text-background/90 font-medium uppercase whitespace-nowrap overflow-hidden px-0.5">
          Research Use Only · User Discretion Advised
        </p>
      </div>

      {/* Main Header */}
      <header className="grid fixed top-[28px] md:top-[30px] left-0 z-50 grid-cols-3 items-start w-full p-sides md:grid-cols-12 md:gap-sides">
        <div className="block flex-none md:hidden">
          <MobileMenu collections={collections} />
        </div>
        <Link href="/" className="md:col-span-3 xl:col-span-2" prefetch>
          <LogoSvg className="w-auto h-6 max-md:place-self-center md:w-full md:h-auto max-w-96" />
        </Link>
        <nav className="flex gap-2 justify-end items-center md:col-span-9 xl:col-span-10">
          <ul className="items-center gap-5 py-0.5 px-3 bg-background/10 rounded-sm backdrop-blur-md hidden md:flex">
            {navItems.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'font-semibold text-base transition-colors duration-200 uppercase',
                    pathname === item.href ? 'text-foreground' : 'text-foreground/50'
                  )}
                  prefetch
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <CartModal />
        </nav>
      </header>
    </>
  );
}
