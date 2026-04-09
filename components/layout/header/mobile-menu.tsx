'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import {
  SITE_LEGAL_ROUTES,
  SITE_PRIMARY_ROUTES,
  SITE_SECONDARY_ROUTES,
} from '@/lib/app-routes';
import { SidebarLinks } from '../sidebar/product-sidebar-links';
import { ShopLinks } from '../shop-links';
import { Collection } from '@/lib/swell/types';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { IntentLink } from '@/components/navigation/intent-link';

interface MobileMenuProps {
  collections: Collection[];
}

export default function MobileMenu({ collections }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const openMobileMenu = () => setIsOpen(true);
  const closeMobileMenu = () => setIsOpen(false);

  // Lock body scroll when menu is open
  useBodyScrollLock(isOpen);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  // Close menu when route changes
  useEffect(() => {
    closeMobileMenu();
  }, [pathname]);

  return (
    <>
      <Button
        onClick={openMobileMenu}
        aria-label="Open mobile menu"
        variant="secondary"
        size="sm"
        className="uppercase md:hidden"
      >
        Menu
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed inset-0 z-50 bg-foreground/30"
              onClick={closeMobileMenu}
              aria-hidden="true"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed top-0 bottom-0 left-0 flex w-full md:w-[400px] p-modal-sides z-50"
            >
              <div className="flex flex-col p-3 w-full rounded bg-muted md:p-4">
                <div className="flex justify-between items-baseline pl-2 mb-10">
                  <p className="text-2xl font-semibold">Menu</p>
                  <Button size="sm" variant="ghost" aria-label="Close cart" onClick={closeMobileMenu}>
                    Close
                  </Button>
                </div>

                <nav className="grid grid-cols-2 gap-y-4 gap-x-6 mb-8">
                  {SITE_PRIMARY_ROUTES.map(item => (
                    <Button
                      key={item.href}
                      size="sm"
                      variant="secondary"
                      onClick={closeMobileMenu}
                      className="justify-start uppercase bg-background/50"
                      asChild
                    >
                      <IntentLink href={item.href}>
                        {item.label}
                      </IntentLink>
                    </Button>
                  ))}
                </nav>

                <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/45">
                      Explore
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                      {SITE_SECONDARY_ROUTES.map((item) => (
                        <IntentLink
                          key={item.href}
                          href={item.href}
                          className="text-foreground/70 transition-colors hover:text-foreground"
                          onClick={closeMobileMenu}
                        >
                          {item.label}
                        </IntentLink>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/45">
                      Policies
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                      {SITE_LEGAL_ROUTES.map((item) => (
                        <IntentLink
                          key={item.href}
                          href={item.href}
                          className="text-foreground/70 transition-colors hover:text-foreground"
                          onClick={closeMobileMenu}
                        >
                          {item.label}
                        </IntentLink>
                      ))}
                    </div>
                  </div>
                </div>

                <ShopLinks label="Categories" collections={collections} />

                <div className="mt-auto mb-6 text-sm leading-tight opacity-50">
                  <p className="italic">Research-grade peptides. &gt;99% purity.</p>
                  <div className="mt-3">
                    <p>Third-party batch testing. COAs included.</p>
                    <p>Ships same day. Free Shipping over $250.</p>
                  </div>
                  <div className="mt-3">
                    <p>Peptides that don&apos;t need promises, just proof.</p>
                    <p>Pure chemistry, zero hype.</p>
                    <p>Transparency with teeth — results over rhetoric.</p>
                  </div>
                </div>
                <SidebarLinks className="gap-2 w-full" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
