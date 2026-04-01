'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
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
  const snowflakes = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, index) => ({
        id: index,
        left: (index * 13) % 100,
        duration: 6 + (index % 5),
        delay: (index % 7) * 0.5,
        size: 3 + (index % 3),
        opacity: 0.25 + (index % 4) * 0.1,
      })),
    []
  );

  useBodyScrollLock(isOpen);

  useEffect(() => {
    try {
      const hasAcknowledged = window.localStorage.getItem(STORAGE_KEY) === 'true';
      setIsOpen(!hasAcknowledged);
    } catch {
      // Storage unavailable: fail open so users still see the disclaimer.
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
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
    // Attempt to close the current tab/window.
    window.open('', '_self');
    window.close();

    // Fallback for browsers that block closing non-script-opened tabs.
    setTimeout(() => {
      window.location.replace('about:blank');
    }, 80);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm p-4"
          >
            <div className="h-full w-full grid place-items-center">
              <motion.section
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className="relative w-full max-w-lg overflow-hidden rounded-md border border-white/25 bg-[#0B2E2F] p-6 text-white md:p-7 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="research-disclaimer-title"
                aria-describedby="research-disclaimer-description"
              >
                <div className="pointer-events-none absolute inset-0">
                  {snowflakes.map((flake) => (
                    <span
                      key={flake.id}
                      className="snowflake"
                      style={{
                        left: `${flake.left}%`,
                        width: `${flake.size}px`,
                        height: `${flake.size}px`,
                        animationDuration: `${flake.duration}s`,
                        animationDelay: `${flake.delay}s`,
                        opacity: flake.opacity,
                      }}
                    />
                  ))}
                </div>

                <div className="relative text-center">
                  <div className="mb-4 flex flex-col items-center">
                    <LogoSvg className="w-44 h-auto md:w-52 text-white" />
                    <p className="mt-2 text-[11px] tracking-[0.14em] uppercase text-white/80">
                      Intelligence Beyond Baseline
                    </p>
                  </div>
                  <p className="mb-1 text-sm font-medium text-white/80">
                    Revalin Access Notice
                  </p>
                  <h2 id="research-disclaimer-title" className="mb-3 text-2xl font-semibold leading-tight text-white">
                    Research Use Compliance
                  </h2>
                  <p id="research-disclaimer-description" className="text-sm text-white/85">
                    Revalin is a chemical supplier for legitimate research institutions and professionals. Revalin is
                    not a compounding pharmacy or chemical compounding facility as defined under Section 503A of the
                    Federal Food, Drug, and Cosmetic Act, and is not an outsourcing facility as defined under Section
                    503B of the Federal Food, Drug, and Cosmetic Act.
                  </p>

                  <p className="mt-3 text-sm text-white/85">
                    All products are provided exclusively for in-vitro and pre-clinical research. They are not for
                    human or veterinary use, consumption, or therapeutic application. By continuing, you confirm your
                    organization has appropriate facilities, trained personnel, and safety controls for lawful handling
                    and accepts responsibility for compliant use.
                  </p>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company / Institution (optional)"
                      className="h-9 w-full rounded border border-white/25 bg-white/10 px-3 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/50 sm:w-1/2"
                    />
                    <select
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className="h-9 w-full rounded border border-white/25 bg-white/10 px-3 text-sm text-white outline-none focus:border-white/50 sm:w-1/2"
                    >
                      <option value="" className="bg-[#0B2E2F]">Business Type (optional)</option>
                      {BUSINESS_TYPES.map((type) => (
                        <option key={type} value={type} className="bg-[#0B2E2F]">{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 rounded border border-white/25 bg-white/10 p-3 text-xs text-white/90">
                    {RESEARCH_USE_SHORT_ACKNOWLEDGMENT}
                  </div>
                  <p className="mt-3 text-xs text-white/80">
                    By continuing, you agree to our{' '}
                    <Link className="underline underline-offset-4" href="/terms-of-service">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link className="underline underline-offset-4" href="/privacy-policy">
                      Privacy Policy
                    </Link>
                    .
                  </p>

                  <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleExit}
                      className="sm:min-w-28 border-white/40 text-white hover:bg-white/10 hover:text-white"
                    >
                      Leave
                    </Button>
                    <Button onClick={handleAccept} className="sm:min-w-44 bg-white text-[#0B2E2F] hover:bg-white/90">
                      I Understand
                    </Button>
                  </div>
                </div>
              </motion.section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .snowflake {
          position: absolute;
          top: -8%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.85);
          animation-name: snowfall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          filter: blur(0.15px);
        }

        @keyframes snowfall {
          0% {
            transform: translate3d(0, -12%, 0);
          }
          100% {
            transform: translate3d(12px, 120%, 0);
          }
        }
      `}</style>
    </>
  );
}
