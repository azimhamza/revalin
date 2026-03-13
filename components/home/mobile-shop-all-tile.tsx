'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

export function MobileShopAllTile() {
  return (
    <Link
      href="/shop"
      prefetch
      className="flex h-20 w-full items-center justify-center bg-[#0B2E2F] text-xl font-bold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
    >
      <span className="relative inline-flex pb-2">
        <span>SHOP ALL</span>
        <motion.span
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left rounded-full bg-[#F4F1EA]/90"
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </span>
    </Link>
  );
}
