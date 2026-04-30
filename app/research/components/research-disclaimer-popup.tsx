'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { LogoSvg } from '@/components/layout/header/logo-svg';
import Link from 'next/link';
import { FlaskConical, ShieldCheck, FileCheck2 } from 'lucide-react';

const STORAGE_KEY = 'revalin_research_verified';

const INFO_POINTS = [
  { icon: FlaskConical, text: 'Research-grade peptides for in-vitro and pre-clinical use' },
  { icon: ShieldCheck, text: 'Independently tested by Janoshik Analytical' },
  { icon: FileCheck2, text: 'Published COAs with every batch' },
] as const;

export function ResearchDisclaimerPopup() {
  const [isOpen, setIsOpen] = useState(true);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    try {
      const hasAcknowledged = window.localStorage.getItem(STORAGE_KEY) === 'true';
      setIsOpen(!hasAcknowledged);
    } catch {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // If storage is unavailable, keep an in-memory acknowledgement.
    }
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
        >
          <div className="flex h-full w-full items-center justify-center p-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="relative w-full max-w-md overflow-y-auto max-h-[90vh] rounded-2xl bg-[#F4F1EA] px-7 py-8 shadow-2xl md:px-10 md:py-10"
              role="dialog"
              aria-modal="true"
              aria-labelledby="age-gate-title"
              aria-describedby="age-gate-description"
            >
              {/* Logo */}
              <div className="flex flex-col items-center">
                <LogoSvg className="w-36 h-auto text-[#0B2E2F]" />
              </div>

              {/* Divider */}
              <div className="my-6 h-px bg-[#0B2E2F]/10" />

              {/* Heading */}
              <h2
                id="age-gate-title"
                className="text-center text-xl font-semibold tracking-tight text-[#0B2E2F]"
              >
                Welcome to Revalin
              </h2>
              <p className="mt-2 text-center text-[13px] leading-relaxed text-[#0B2E2F]/55">
                Canadian supplier of research-grade peptides for qualified researchers and institutions.
              </p>

              {/* Info points */}
              <div className="mt-6 space-y-2.5">
                {INFO_POINTS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 rounded-xl bg-[#0B2E2F]/[0.04] px-4 py-3">
                    <Icon className="size-4 shrink-0 text-[#0B2E2F]/50" strokeWidth={1.5} />
                    <span className="text-[13px] text-[#0B2E2F]/70">{text}</span>
                  </div>
                ))}
              </div>

              {/* Research disclaimer */}
              <p
                id="age-gate-description"
                className="mt-5 text-center text-[12px] leading-relaxed text-[#0B2E2F]/50"
              >
                All products are strictly for research purposes only and are not intended for human consumption. These products have not been evaluated or approved by the FDA or Health Canada.
              </p>

              {/* Age gate */}
              <div className="mt-6 rounded-xl border border-[#0B2E2F]/8 bg-white/50 px-4 py-3.5 text-center">
                <p className="text-[13px] font-medium text-[#0B2E2F]/80">
                  You must be 21 or older to browse this site.
                </p>
              </div>

              {/* Button */}
              <div className="mt-6">
                <button
                  onClick={handleAccept}
                  className="h-12 w-full rounded-full bg-[#0B2E2F] text-sm font-medium text-[#F4F1EA] transition-all hover:bg-[#0B2E2F]/90"
                >
                  I&apos;m 21 or older — Enter Site
                </button>
              </div>

              {/* Legal links */}
              <p className="mt-5 text-center text-[11px] text-[#0B2E2F]/40">
                By continuing, you agree to our{' '}
                <Link className="underline underline-offset-2 hover:text-[#0B2E2F]/60" href="/terms-of-service">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link className="underline underline-offset-2 hover:text-[#0B2E2F]/60" href="/privacy-policy">
                  Privacy Policy
                </Link>
              </p>
            </motion.section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
