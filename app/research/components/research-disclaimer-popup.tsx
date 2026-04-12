'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { LogoSvg } from '@/components/layout/header/logo-svg';
import Link from 'next/link';
import { RESEARCH_USE_SHORT_ACKNOWLEDGMENT } from '@/lib/compliance';

const STORAGE_KEY = 'revalin_research_verified';

const BUSINESS_TYPES = ['Research Lab', 'University', 'Medical Facility', 'Business'] as const;

export function ResearchDisclaimerPopup() {
  const [isOpen, setIsOpen] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [agreed, setAgreed] = useState(false);

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
    if (!agreed) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      if (companyName || businessType) {
        window.localStorage.setItem(
          `${STORAGE_KEY}_info`,
          JSON.stringify({ company: companyName, type: businessType })
        );
      }
    } catch {
      // If storage is unavailable, keep an in-memory acknowledgement.
    }
    setIsOpen(false);
  };

  const handleExit = () => {
    window.open('', '_self');
    window.close();
    setTimeout(() => {
      window.location.replace('about:blank');
    }, 80);
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
              aria-labelledby="research-disclaimer-title"
              aria-describedby="research-disclaimer-description"
            >
              {/* Logo */}
              <div className="flex flex-col items-center">
                <LogoSvg className="w-36 h-auto text-[#0B2E2F]" />
              </div>

              {/* Divider */}
              <div className="my-6 h-px bg-[#0B2E2F]/10" />

              {/* Heading */}
              <h2
                id="research-disclaimer-title"
                className="text-center text-xl font-semibold tracking-tight text-[#0B2E2F]"
              >
                Research Use Only
              </h2>
              <p className="mt-2 text-center text-[13px] leading-relaxed text-[#0B2E2F]/60">
                Please review before continuing
              </p>

              {/* Body */}
              <div className="mt-6 space-y-3">
                <p
                  id="research-disclaimer-description"
                  className="text-[13px] leading-relaxed text-[#0B2E2F]/75"
                >
                  All products are provided exclusively for in-vitro and pre-clinical research.
                  They are not intended for human or veterinary use, consumption, or therapeutic
                  application.
                </p>
                <p className="text-[13px] leading-relaxed text-[#0B2E2F]/75">
                  By continuing, you confirm your organization has appropriate facilities, trained
                  personnel, and safety controls for lawful handling.
                </p>
              </div>

              {/* Form fields */}
              <div className="mt-6 space-y-3">
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company / Institution (optional)"
                  className="h-11 w-full rounded-lg border border-[#0B2E2F]/12 bg-white px-4 text-sm text-[#0B2E2F] placeholder:text-[#0B2E2F]/35 outline-none transition-colors focus:border-[#0B2E2F]/30"
                />
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[#0B2E2F]/12 bg-white px-4 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F]/30"
                >
                  <option value="">Business Type (optional)</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Acknowledgment checkbox */}
              <label className="mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#0B2E2F]/20 accent-[#0B2E2F]"
                />
                <span className="text-[12px] leading-relaxed text-[#0B2E2F]/70">
                  {RESEARCH_USE_SHORT_ACKNOWLEDGMENT}
                </span>
              </label>

              {/* Buttons */}
              <div className="mt-7 flex flex-col gap-2.5">
                <button
                  onClick={handleAccept}
                  disabled={!agreed}
                  className="h-12 w-full rounded-full bg-[#0B2E2F] text-sm font-medium text-[#F4F1EA] transition-all hover:bg-[#0B2E2F]/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  I Understand
                </button>
                <button
                  onClick={handleExit}
                  className="h-10 w-full rounded-full text-sm font-medium text-[#0B2E2F]/50 transition-colors hover:text-[#0B2E2F]/80"
                >
                  Leave Site
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
