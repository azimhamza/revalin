'use client';

import { usePathname } from 'next/navigation';

import { WelcomePopup } from '@/components/home/welcome-popup';
import type { Collection } from '@/lib/swell/types';
import { ResearchDisclaimerPopup } from '@/app/research/components/research-disclaimer-popup';

import { Header } from './header';

const HIDDEN_CHROME_PREFIXES = ['/admin'];

type AppChromeProps = {
  collections: Collection[];
};

export function AppChrome({ collections }: AppChromeProps) {
  const pathname = usePathname();
  const shouldHideChrome = HIDDEN_CHROME_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (shouldHideChrome) {
    return null;
  }

  return (
    <>
      <ResearchDisclaimerPopup />
      <WelcomePopup />
      <Header collections={collections} />
    </>
  );
}
