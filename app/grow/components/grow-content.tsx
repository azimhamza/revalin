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

const EARNING_TIERS = [
  { revenue: '$0 – $9,999', rate: '15%', tier: 'Operator' },
  { revenue: '$10,000 – $29,999', rate: '18%', tier: 'Builder' },
  { revenue: '$30,000 – $49,999', rate: '22%', tier: 'Scaler' },
  { revenue: '$50,000 – $74,999', rate: '30%', tier: 'Partner' },
  { revenue: '$75,000 – $99,999', rate: '33%', tier: 'Apex' },
  { revenue: '$100,000 – $499,999', rate: '38%', tier: 'Authority' },
  { revenue: '$500,000+', rate: '45%', tier: 'Equity Partner' },
] as const;

const GROWTH_STATS = [
  { label: 'Starting At', value: '15%' },
  { label: 'Up To', value: '45%+' },
  { label: 'Payouts', value: 'Weekly' },
  { label: 'Settlement', value: 'USDC' },
] as const;

const PROMOTER_STATS = [
  { label: 'Starting Rate', value: '2%' },
  { label: 'Scales With', value: 'Network size' },
  { label: 'Earnings', value: 'Recurring' },
  { label: 'Settlement', value: 'USDC' },
] as const;

const DASHBOARD_FEATURES = [
  {
    title: 'Traffic trends',
    desc: 'Daily click and visitor charts. See exactly when your audience engages.',
  },
  {
    title: 'Conversion tracking',
    desc: 'Per-click conversion rates, revenue per visit, and sales attribution.',
  },
  {
    title: 'Referrer breakdown',
    desc: 'Which domains, platforms, and campaigns send you the most traffic.',
  },
  {
    title: 'Device & geography',
    desc: 'Desktop vs mobile splits. Country-level distribution of your audience.',
  },
  {
    title: 'UTM support',
    desc: 'Track source, medium, and campaign parameters across every link you share.',
  },
  {
    title: 'On-chain settlements',
    desc: 'Every payout links to a Polygon transaction. Verifiable, permanent, yours.',
  },
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

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.li
      variants={fadeUp}
      className="flex items-start gap-3 text-base leading-[1.6] text-[#0B2E2F]/78 md:text-lg"
    >
      <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0B2E2F]/30" />
      <span>{children}</span>
    </motion.li>
  );
}

export function GrowContent() {
  const heroWords = ['Grow.'];

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
            Revalin — Partner Program
          </motion.p>

          <motion.h1
            className="mt-4 flex flex-wrap text-5xl tracking-[-0.05em] md:mt-6 md:text-[7.5rem] md:leading-[0.88]"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            {heroWords.map((word) => (
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
            Two ways to grow with us.
          </motion.p>
        </div>
      </section>

      {/* ── 01 / Growth Partners ───────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="01" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                Growth Partners.
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
                Share your unique referral link. Earn <strong>15% commission</strong> on
                every sale from day one — and scale up to <strong>45% + equity</strong> as
                your referred revenue grows.
              </Paragraph>

              <motion.ul variants={fadeUp} className="space-y-3 pt-2">
                <FeatureItem>
                  <strong>Unique referral link + discount code</strong> assigned on signup
                </FeatureItem>
                <FeatureItem>
                  <strong>Weekly USDC payouts</strong> to your connected Polygon wallet
                </FeatureItem>
                <FeatureItem>
                  <strong>Full sales ledger</strong> — every order tracked from click to settlement
                </FeatureItem>
                <FeatureItem>
                  <strong>Real-time analytics dashboard</strong> with traffic, conversions, and revenue
                </FeatureItem>
              </motion.ul>

              <Paragraph>
                Built for content creators, researchers, community moderators — anyone whose
                audience trusts what they recommend.
              </Paragraph>
            </motion.div>
          </div>

          {/* Stats row */}
          <motion.div
            className="mt-14 grid grid-cols-2 gap-3 md:mt-20 md:grid-cols-4 md:gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerContainerFast}
          >
            {GROWTH_STATS.map(({ label, value }) => (
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

          {/* Earning tiers table */}
          <motion.div
            className="mt-10 overflow-hidden rounded-[12px] border border-[#0B2E2F]/10 md:mt-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="border-b border-[#0B2E2F]/10 px-5 py-4 md:px-6">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#0B2E2F]/45">
                Commission tiers
              </p>
            </div>
            <div className="divide-y divide-[#0B2E2F]/6">
              {EARNING_TIERS.map(({ revenue, rate, tier }) => (
                <div
                  key={tier}
                  className="grid grid-cols-3 items-center px-5 py-3.5 md:px-6"
                >
                  <span className="text-sm text-[#0B2E2F]/65">{revenue}</span>
                  <span className="text-center text-lg font-medium tracking-[-0.02em] text-[#0B2E2F]">
                    {rate}
                  </span>
                  <span className="text-right text-sm font-medium text-[#0B2E2F]/50">
                    {tier}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            className="mt-10 md:mt-14"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
          >
            <Link
              href="/affiliate/signup"
              className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#F4F1EA] transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#0B2E2F' }}
            >
              Become a Growth Partner
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── 02 / Promoters ─────────────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="02" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                Promoters.
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
                You don't refer customers — you recruit Growth Partners. When they earn,
                you earn too. Starting at <strong>2% on every sale</strong> your recruited
                partners generate.
              </Paragraph>

              <motion.ul variants={fadeUp} className="space-y-3 pt-2">
                <FeatureItem>
                  <strong>Scaling commission rates</strong> — the more partners you onboard, the higher
                  your rate climbs
                </FeatureItem>
                <FeatureItem>
                  <strong>Recurring earnings</strong> — you earn on every sale your partners make, indefinitely
                </FeatureItem>
                <FeatureItem>
                  <strong>Network dashboard</strong> — track every partner, their sales, and your
                  total earnings
                </FeatureItem>
                <FeatureItem>
                  <strong>Weekly USDC settlements</strong> — same payout infrastructure as Growth Partners
                </FeatureItem>
              </motion.ul>

              <Paragraph>
                For people with reach — community leaders, network builders, and anyone who
                knows the right people for the program.
              </Paragraph>
            </motion.div>
          </div>

          {/* Stats row */}
          <motion.div
            className="mt-14 grid grid-cols-2 gap-3 md:mt-20 md:grid-cols-4 md:gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={staggerContainerFast}
          >
            {PROMOTER_STATS.map(({ label, value }) => (
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

          {/* CTA */}
          <motion.div
            className="mt-10 md:mt-14"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
          >
            <Link
              href="/promoter/signup"
              className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[#F4F1EA] transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#0B2E2F' }}
            >
              Become a Promoter
              <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Pull quote — bridge to analytics ───────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <motion.blockquote
            className="max-w-5xl text-4xl italic tracking-[-0.04em] leading-[1.05] md:text-[6.5rem] md:leading-[0.92]"
            initial={{ opacity: 0, y: 48 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            No black boxes. No "trust us" payouts.
          </motion.blockquote>
        </div>
      </section>

      {/* ── 03 / Your dashboard ────────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-16 md:py-28">
        <div className="mx-auto max-w-[1600px]">
          <SectionMarker number="03" />

          <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-12 md:gap-14">
            <div className="md:col-span-5">
              <motion.h2
                className="scroll-mt-24 text-4xl tracking-[-0.04em] md:text-[4rem] md:leading-[0.95]"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                Your dashboard.
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
                Most partner programs give you a link and a lifetime total. We give you the
                same analytics you'd expect from your own storefront.
              </Paragraph>
              <Paragraph>
                Every click, every conversion, every dollar — tracked in real time and
                visible the moment it happens. Commission states from <strong>pending</strong> to{' '}
                <strong>approved</strong> to <strong>paid</strong>. Settlement batches with
                on-chain transaction links you can verify yourself.
              </Paragraph>
            </motion.div>
          </div>

          {/* Feature grid — 2×3 on desktop, stacked on mobile */}
          <motion.div
            className="mt-14 grid gap-4 sm:grid-cols-2 md:mt-20 lg:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={staggerContainerFast}
          >
            {DASHBOARD_FEATURES.map(({ title, desc }) => (
              <motion.div
                key={title}
                variants={chipPop}
                className="rounded-[12px] border border-[#0B2E2F]/10 p-6 md:p-7"
              >
                <p className="text-sm font-medium tracking-[-0.01em] text-[#0B2E2F]">
                  {title}
                </p>
                <p className="mt-2 text-sm leading-[1.6] text-[#0B2E2F]/55">{desc}</p>
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
            You see everything we see.
          </motion.p>
        </div>
      </section>

      {/* ── Compliance disclaimer ──────────────────────────── */}
      <section className="border-t border-[#0B2E2F]/12 px-sides py-12 md:py-16">
        <div className="mx-auto max-w-[1600px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#0B2E2F]/45">
              Compliance
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-[1.7] text-[#0B2E2F]/55">
              All Revalin products are sold exclusively for research purposes. Partners are
              expected to represent products accurately and in compliance with applicable
              regulations. No health, wellness, or therapeutic claims should be made.
            </p>
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
            From Waterloo, Canada. Built for people who take this seriously.
          </motion.p>
        </div>
      </section>
    </div>
  );
}
