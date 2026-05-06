'use client';

import { motion } from 'motion/react';
import {
  FlaskConical,
  DollarSign,
  Headset,
  FileCheck2,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { fadeUp, staggerContainer, EASE } from '@/lib/animations';
import { SectionMarker } from '@/components/home/section-marker';

const FEATURES = [
  {
    icon: FlaskConical,
    title: 'Research-Grade Quality',
    description: 'Every batch independently tested by Janoshik Analytical with published COAs and verification keys.',
    accent: '#2D6A4F',
  },
  {
    icon: DollarSign,
    title: 'Competitive Pricing',
    description: 'Volume discounts on bulk orders. Premium compounds without the premium markup.',
    accent: '#1B4332',
  },
  {
    icon: Headset,
    title: 'Expert Support',
    description: 'Direct access to our team for order questions, product specifications, and research guidance.',
    accent: '#40916C',
  },
  {
    icon: FileCheck2,
    title: 'Open COA Library',
    description: 'Full Certificates of Analysis with verification keys — no request forms, no gatekeeping.',
    accent: '#2D6A4F',
  },
  {
    icon: Zap,
    title: 'Same-Day Shipping',
    description: 'Orders placed before cutoff ship the same day with full tracking. Proudly Canadian.',
    accent: '#1B4332',
  },
  {
    icon: ShieldCheck,
    title: 'Free Shipment Protection',
    description: 'Every order includes complimentary shipping insurance. Lost packages are replaced at no cost.',
    accent: '#40916C',
  },
] as const;

export function FeatureCardsSection() {
  return (
    <section className="relative overflow-hidden bg-[#F4F1EA] px-sides py-20 text-[#0B2E2F] md:py-32">
      {/* Subtle gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#E8E1D4]/30 to-transparent" />

      <div className="relative mx-auto max-w-[1600px]">
        <SectionMarker label="Features" />

        <motion.div
          className="mt-10 md:mt-16"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: EASE }}
        >
          <h2 className="max-w-xl text-[1.75rem] font-semibold tracking-[-0.04em] md:text-[3.25rem] md:leading-[1.05]">
            Everything you need for your research.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#0B2E2F]/55 md:text-base">
            Lab-grade research chemicals backed by transparent testing, fast fulfillment, and dedicated support.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={staggerContainer}
        >
          {FEATURES.map(({ icon: Icon, title, description, accent }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-2xl border border-[#0B2E2F]/[0.06] bg-white/80 p-7 shadow-[0_4px_40px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-shadow hover:shadow-[0_8px_50px_rgba(0,0,0,0.08)] md:p-8"
            >
              {/* Colored left accent bar */}
              <div
                className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
                style={{ backgroundColor: accent }}
              />

              <div
                className="flex size-11 items-center justify-center rounded-xl md:size-12"
                style={{ backgroundColor: `${accent}12` }}
              >
                <Icon className="size-5 md:size-5" strokeWidth={1.5} style={{ color: accent }} />
              </div>

              <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] md:text-base">
                {title}
              </h3>
              <p className="mt-2.5 text-[13px] leading-[1.7] text-[#0B2E2F]/60 md:text-sm md:leading-[1.7]">
                {description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
