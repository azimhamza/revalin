'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { EASE, fadeUp, staggerContainer } from '@/lib/animations';

export function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden bg-[#F4F1EA] px-sides py-20 text-[#0B2E2F] md:py-32">
      {/* Decorative gradient depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#E8E1D4]/40 to-transparent" />

      <motion.div
        className="relative mx-auto max-w-3xl text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={staggerContainer}
      >
        <motion.h2
          variants={fadeUp}
          className="text-[1.75rem] font-semibold tracking-[-0.04em] md:text-[3.5rem] md:leading-[1.05]"
        >
          Research-grade compounds. Shipped today.
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-[#0B2E2F]/55 md:text-base"
        >
          All the research chemicals you need, with independently verified quality and same-day dispatch. Proudly Canadian.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-10">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#0B2E2F] px-9 py-4 text-sm font-medium text-[#F4F1EA] shadow-[0_4px_24px_rgba(11,46,47,0.25)] transition-all hover:shadow-[0_8px_32px_rgba(11,46,47,0.35)] hover:translate-y-[-1px]"
          >
            Shop Now
            <ArrowRight className="size-4" strokeWidth={2} />
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
