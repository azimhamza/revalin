'use client';

import { BadgeCheck, Droplets, Truck, Package } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { chipPop, staggerContainerFast } from '@/lib/animations';

const TRUST_ITEMS = [
  { icon: BadgeCheck, label: 'Independently Verified', accent: '#2D6A4F' },
  { icon: Droplets, label: '>99% Purity', accent: '#1B4332' },
  { icon: Truck, label: 'Same-Day Dispatch', accent: '#40916C' },
  { icon: Package, label: 'Free Shipping $250 USD / $350 CAD+', accent: '#2D6A4F' },
] as const;

export function TrustStrip({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn('w-full px-sides', className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.4 }}
      variants={staggerContainerFast}
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {TRUST_ITEMS.map(({ icon: Icon, label, accent }) => (
          <motion.div
            key={label}
            variants={chipPop}
            className="flex items-center gap-3 rounded-2xl border border-[#0B2E2F]/[0.06] bg-white/70 px-4 py-4 shadow-[0_2px_20px_rgba(0,0,0,0.03)] backdrop-blur-sm md:px-5 md:py-5"
          >
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-xl md:size-10"
              style={{ backgroundColor: `${accent}14` }}
            >
              <Icon className="size-4 md:size-[18px]" strokeWidth={1.5} style={{ color: accent }} />
            </div>
            <span className="text-xs font-medium tracking-[-0.01em] text-[#0B2E2F]/80 md:text-sm">
              {label}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
