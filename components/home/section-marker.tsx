'use client';

import { motion } from 'motion/react';
import { fadeUp, ruleDraw, staggerContainerFast } from '@/lib/animations';

export function SectionMarker({ label }: { label: string }) {
  return (
    <motion.div
      className="flex items-center gap-5"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.6 }}
      variants={staggerContainerFast}
    >
      <motion.span
        variants={fadeUp}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#0B2E2F]/55"
      >
        {label}
      </motion.span>
      <motion.div
        variants={ruleDraw}
        style={{ originX: 0 }}
        className="h-px flex-1 bg-[#0B2E2F]/20"
      />
    </motion.div>
  );
}
