'use client';

import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: EASE },
  },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.14, delayChildren: 0.05 },
  },
};

const staggerContainerFast: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const wordReveal: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE },
  },
};

const ruleDraw: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 1.1, ease: EASE },
  },
};

const chipPop: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 14 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

const STATS = [
  { label: 'Avg Purity', value: '>99%' },
  { label: 'Testing', value: 'Janoshik' },
  { label: 'Dispatch', value: 'Same day' },
  { label: 'Origin', value: 'Canada' },
] as const;

function SectionMarker({ number }: { number: string }) {
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
        {number}
      </motion.span>
      <motion.div
        variants={ruleDraw}
        style={{ originX: 0 }}
        className="h-px flex-1 bg-[#0B2E2F]/20"
      />
    </motion.div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      variants={fadeUp}
      className="text-base leading-[1.7] text-[#0B2E2F]/78 md:text-lg"
    >
      {children}
    </motion.p>
  );
}

export function AboutContent() {
  const heroWords = ['About', 'Revalin.'];

  return (
    <div className="text-[#0B2E2F]">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="px-sides pt-top-spacing pb-16 md:pb-28">
        <div className="mx-auto max-w-[1600px]">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[#0B2E2F]/55"
          >
            Revalin — Proudly Canadian
          </motion.p>

          <motion.h1
            className="mt-4 flex flex-wrap text-5xl tracking-[-0.05em] md:mt-6 md:text-[7.5rem] md:leading-[0.88]"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            {heroWords.map((word, i) => (
              <motion.span
                key={word}
                variants={wordReveal}
                className="mr-[0.18em] inline-block"
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
            className="mt-6 max-w-xl text-base italic leading-relaxed text-[#0B2E2F]/72 md:mt-10 md:text-lg"
          >
            Why this exists, and who it's for.
          </motion.p>
        </div>
      </section>

      {/* ── 01 / Who we are ───────────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="01" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                id="who-we-are"
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                Who we are.
              </motion.h2>
            </div>

            <motion.div
              className="max-w-2xl space-y-6 md:col-span-7"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={staggerContainer}
            >
              <Paragraph>
                We started Revalin because the research chemical market didn't reflect the
                seriousness of the science. Grey-market suppliers with no documentation,
                no third-party testing, and packaging that felt more like a back-alley
                transaction than a considered purchase. The compounds existed — but the
                infrastructure around them didn't.
              </Paragraph>
              <Paragraph>
                Researchers deserved better. Verified purity, open Certificates of Analysis,
                and a supplier that treats documentation as a baseline — not a differentiator.
                That's the gap we set out to fill.
              </Paragraph>
            </motion.div>
          </div>

          {/* Pull quote — emotional climax of section 01 */}
          <motion.blockquote
            className="mt-20 max-w-5xl text-4xl italic tracking-[-0.04em] leading-[1.05] md:mt-32 md:text-[6.5rem] md:leading-[0.92]"
            initial={{ opacity: 0, y: 48 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            So we built what didn't exist.
          </motion.blockquote>
        </div>
      </section>

      {/* ── 02 / Why we exist ─────────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="02" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                id="why-we-exist"
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                Why we exist.
              </motion.h2>
            </div>

            <motion.div
              className="max-w-2xl space-y-6 md:col-span-7"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={staggerContainer}
            >
              <Paragraph>
                The research chemical space has a trust problem. Most suppliers can't substantiate their
                claims — and don't try. We believe that's the wrong foundation for a category
                where what's in the vial actually matters.
              </Paragraph>
              <Paragraph>
                Revalin exists for qualified researchers and institutions who demand verified
                documentation and refuse to compromise on material quality. People who read
                the Certificate of Analysis before anything else, and who expect their supplier
                to meet the same standard they hold themselves to.
              </Paragraph>
              <Paragraph>
                The research chemical category has operated without accountability for too long.
                We intend to change that.
              </Paragraph>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 03 / What sets us apart ───────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="03" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                id="what-makes-us-different"
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                What sets us apart.
              </motion.h2>
            </div>

            <motion.div
              className="max-w-2xl space-y-6 md:col-span-7"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={staggerContainer}
            >
              <Paragraph>
                Every batch is independently tested by Janoshik Analytical — one of the most
                respected research chemical testing laboratories in the world. Our Certificates of Analysis
                are published openly with verification keys you can confirm directly with the lab.
                No request form. No gatekeeping. Just proof.
              </Paragraph>
              <Paragraph>
                We maintain average purity above 99% across all active compounds. Orders ship
                same-day from Canada. Free shipping over $250 USD or $350 CAD. Full tracking on every
                shipment.
              </Paragraph>
            </motion.div>
          </div>

          {/* Stats row — green anchor chips, staggered pop */}
          <motion.div
            className="mt-14 grid grid-cols-2 gap-3 md:mt-20 md:grid-cols-4 md:gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerContainerFast}
          >
            {STATS.map(({ label, value }) => (
              <motion.div
                key={label}
                variants={chipPop}
                className="rounded-[12px] p-5 text-[#F4F1EA] md:p-6"
                style={{ backgroundColor: '#0B2E2F' }}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#F4F1EA]/55">
                  {label}
                </p>
                <p className="mt-3 text-2xl tracking-[-0.04em] md:text-[1.85rem]">{value}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Closing statement */}
          <motion.p
            className="mt-14 max-w-3xl text-2xl italic tracking-[-0.03em] leading-tight md:mt-20 md:text-4xl"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            If the data doesn't meet our standard, we don't sell it.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="mt-10 flex flex-wrap gap-3 md:mt-14 md:gap-4"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
          >
            <Link
              href="/coa"
              className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#F4F1EA] transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#0B2E2F' }}
            >
              Review COAs
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 rounded-[12px] border border-[#0B2E2F]/20 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-[#0B2E2F]/5"
            >
              Shop the catalog
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Sign-off ──────────────────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-14 md:py-20">
        <div className="mx-auto max-w-[1600px]">
          <motion.p
            className="text-center text-base italic leading-relaxed text-[#0B2E2F]/70 md:text-lg"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            Proudly Canadian. Built for people who take this seriously.
          </motion.p>
        </div>
      </section>
    </div>
  );
}
