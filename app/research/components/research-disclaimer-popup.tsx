'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { LogoSvg } from '@/components/layout/header/logo-svg';
import Link from 'next/link';
import { FileCheck2, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import { getApiData, getApiErrorMessage, readJsonSafely } from '@/lib/api/client';
import {
  RESEARCH_CONSENT_ACCEPTED_EVENT,
  RESEARCH_CONSENT_STORAGE_KEY,
} from '@/lib/compliance/research-consent-client';

const LEGACY_STORAGE_KEY = 'revalin_research_verified';

const INFO_POINTS = [
  { icon: FlaskConical, text: 'Research-grade peptides for in-vitro and pre-clinical use' },
  { icon: ShieldCheck, text: 'Independently tested by Janoshik Analytical' },
  { icon: FileCheck2, text: 'Published COAs with every batch' },
] as const;

export function ResearchDisclaimerPopup() {
  const [isOpen, setIsOpen] = useState(true);
  const [institutionName, setInstitutionName] = useState('');
  const [institutionIdentifier, setInstitutionIdentifier] = useState('');
  const [researchUseDescription, setResearchUseDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    let cancelled = false;

    const verifyConsent = async () => {
      try {
        const response = await fetch('/api/compliance/research-consent', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = await readJsonSafely(response);

        if (!response.ok) return;

        const data = getApiData<{ hasConsent?: boolean }>(payload);
        if (!cancelled && data?.hasConsent) {
          try {
            window.localStorage.setItem(LEGACY_STORAGE_KEY, 'true');
          } catch {
            // Local storage is only a client-side UX hint; the server cookie is authoritative.
          }
          window.dispatchEvent(new Event(RESEARCH_CONSENT_ACCEPTED_EVENT));
          setIsOpen(false);
        }
      } catch {
        // Keep the gate open if verification fails.
      }
    };

    void verifyConsent();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAccept = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/compliance/research-consent', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionName,
          institutionIdentifier,
          researchUseDescription,
          entryPath: `${window.location.pathname}${window.location.search}`,
          referrer: document.referrer || null,
        }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to record consent.'));
      }

      const data = getApiData<{
        consentId: string;
        acceptedAt: string;
        termsVersion: string;
      }>(payload);

      if (!data?.consentId || !data.acceptedAt) {
        throw new Error('Unable to record consent.');
      }

      try {
        window.localStorage.setItem(
          RESEARCH_CONSENT_STORAGE_KEY,
          JSON.stringify({
            consentId: data.consentId,
            acceptedAt: data.acceptedAt,
            termsVersion: data.termsVersion,
          }),
        );
        window.localStorage.setItem(LEGACY_STORAGE_KEY, 'true');
      } catch {
        // Consent is already persisted server-side; storage failure should not block entry.
      }
      window.dispatchEvent(new Event(RESEARCH_CONSENT_ACCEPTED_EVENT));
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record consent.');
    } finally {
      setIsSubmitting(false);
    }
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
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#F4F1EA] px-6 py-7 shadow-2xl md:px-9 md:py-9"
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

              <div className="mt-6 rounded-xl border border-[#0B2E2F]/8 bg-white/50 px-4 py-3.5 text-center">
                <p className="text-[13px] font-medium text-[#0B2E2F]/80">
                  You must be 21 or older to browse this site.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/55">
                    Institution or company name optional
                  </span>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(event) => setInstitutionName(event.target.value)}
                    maxLength={256}
                    disabled={isSubmitting}
                    className="h-10 rounded-xl border border-[#0B2E2F]/10 bg-white/65 px-3 text-sm text-[#0B2E2F] outline-none transition-colors placeholder:text-[#0B2E2F]/30 focus:border-[#0B2E2F]/35"
                    placeholder="University, lab, clinic, or business"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/55">
                    Institutional or business number optional
                  </span>
                  <input
                    type="text"
                    value={institutionIdentifier}
                    onChange={(event) => setInstitutionIdentifier(event.target.value)}
                    maxLength={128}
                    disabled={isSubmitting}
                    className="h-10 rounded-xl border border-[#0B2E2F]/10 bg-white/65 px-3 text-sm text-[#0B2E2F] outline-none transition-colors placeholder:text-[#0B2E2F]/30 focus:border-[#0B2E2F]/35"
                    placeholder="Registration, tax, or institutional ID"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/55">
                    Research focus optional
                  </span>
                  <textarea
                    value={researchUseDescription}
                    onChange={(event) => setResearchUseDescription(event.target.value)}
                    maxLength={2000}
                    disabled={isSubmitting}
                    rows={3}
                    className="resize-none rounded-xl border border-[#0B2E2F]/10 bg-white/65 px-3 py-2 text-sm leading-5 text-[#0B2E2F] outline-none transition-colors placeholder:text-[#0B2E2F]/30 focus:border-[#0B2E2F]/35"
                    placeholder="Briefly describe the lawful research context"
                  />
                </label>
              </div>

              <p className="mt-3 text-center text-[11px] leading-5 text-[#0B2E2F]/45">
                This is the research-use access gate, separate from cookie consent. Leaving optional fields blank records that they were not provided.
              </p>

              <div className="mt-6">
                <button
                  onClick={handleAccept}
                  disabled={isSubmitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0B2E2F] text-sm font-medium text-[#F4F1EA] transition-all hover:bg-[#0B2E2F]/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Recording consent
                    </>
                  ) : (
                    'Yes, I agree and enter site'
                  )}
                </button>
              </div>
              {error ? (
                <p className="mt-3 text-center text-xs font-medium text-red-700">{error}</p>
              ) : null}

              <p className="mt-5 text-center text-[11px] text-[#0B2E2F]/40">
                By clicking Yes, you confirm you are 21 or older, are acting for lawful research purposes, and agree to our{' '}
                <Link
                  className="underline underline-offset-2 hover:text-[#0B2E2F]/60"
                  href="/terms-of-service"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  className="underline underline-offset-2 hover:text-[#0B2E2F]/60"
                  href="/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                >
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
