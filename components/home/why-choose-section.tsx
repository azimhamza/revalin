'use client';

import { motion } from 'motion/react';
import {
  PackageCheck,
  TrendingDown,
  ShieldCheck,
  FlaskConical,
  Users,
  Truck,
} from 'lucide-react';
import { fadeUp, staggerContainer, EASE } from '@/lib/animations';
import { SectionMarker } from '@/components/home/section-marker';

const REASONS = [
  {
    icon: PackageCheck,
    title: 'Live Availability',
    description: 'Internal stock controls the shipping estimate shown before checkout.',
  },
  {
    icon: TrendingDown,
    title: 'Volume Pricing',
    description: 'Bulk pricing available on all compounds. Lower per-vial cost at higher quantities.',
  },
  {
    icon: Truck,
    title: 'Protected Shipping',
    description: 'Cold-pack shipping keeps compounds stable. Free insurance on every order.',
  },
  {
    icon: FlaskConical,
    title: '>99% Purity',
    description: 'Every batch tested by Janoshik Analytical. Verified, documented, published.',
  },
  {
    icon: Users,
    title: 'Research Community',
    description: 'Trusted by labs and researchers across Canada and the United States.',
  },
  {
    icon: ShieldCheck,
    title: 'Shipment Protection',
    description: 'Every order includes free shipment protection. Lost packages replaced at no cost.',
  },
] as const;

export function WhyChooseSection() {
  return (
    <section className="relative overflow-hidden bg-[#0B2E2F] px-sides py-20 text-[#F4F1EA] md:py-32">
      {/* Gradient depth overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B2E2F] via-[#0F3D3F] to-[#0B2E2F]" />

      <div className="relative mx-auto max-w-[1600px]">
        <motion.div
          className="flex items-center gap-5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#F4F1EA]/40">
            Why Revalin
          </span>
          <div className="h-px flex-1 bg-[#F4F1EA]/10" />
        </motion.div>

        <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-16">
          {/* Left — heading */}
          <div className="md:col-span-5 lg:col-span-4">
            <motion.h2
              className="text-[1.75rem] font-semibold tracking-[-0.04em] md:text-[3.25rem] md:leading-[1.05]"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 1, ease: EASE }}
            >
              Why researchers choose Revalin.
            </motion.h2>
            <motion.p
              className="mt-5 text-[15px] leading-relaxed text-[#F4F1EA]/50"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
            >
              Documented quality, transparent pricing, and clear fulfillment timelines for research professionals.
            </motion.p>
          </div>

          {/* Right — card grid */}
          <motion.div
            className="grid gap-3 sm:grid-cols-2 md:col-span-7 md:gap-4 lg:col-span-8 lg:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={staggerContainer}
          >
            {REASONS.map(({ icon: Icon, title, description }) => (
              <motion.div
                key={title}
                variants={fadeUp}
                className="rounded-2xl border border-[#F4F1EA]/[0.06] bg-[#F4F1EA]/[0.04] p-6 backdrop-blur-sm transition-colors hover:bg-[#F4F1EA]/[0.07]"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4F1EA]/[0.08]">
                  <Icon className="size-[18px] text-[#F4F1EA]/70" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-sm font-semibold tracking-[-0.01em] text-[#F4F1EA]/90">
                  {title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.7] text-[#F4F1EA]/45">
                  {description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
