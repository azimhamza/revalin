'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import { LogoSvg } from '@/components/layout/header/logo-svg';
import Link from 'next/link';
import { FileCheck2, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import { getApiData, getApiErrorMessage, readJsonSafely } from '@/lib/api/client';
import { RESEARCH_USE_TERMS_VERSION } from '@/lib/compliance';
import {
  RESEARCH_CONSENT_ACCEPTED_EVENT,
  RESEARCH_CONSENT_STORAGE_KEY,
} from '@/lib/compliance/research-consent-client';

const LEGACY_STORAGE_KEY = 'revalin_research_verified';

const INFO_POINTS = [
  { icon: FlaskConical, text: 'Research-grade chemicals for in-vitro and pre-clinical use' },
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

  const handleAccept = () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const acceptedAt = new Date().toISOString();
    const payload = {
      institutionName,
      institutionIdentifier,
      researchUseDescription,
      entryPath: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || null,
    };

    setIsOpen(false);
    window.dispatchEvent(new Event(RESEARCH_CONSENT_ACCEPTED_EVENT));

    window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          RESEARCH_CONSENT_STORAGE_KEY,
          JSON.stringify({
            consentId: 'pending',
            acceptedAt,
            termsVersion: RESEARCH_USE_TERMS_VERSION,
          }),
        );
        window.localStorage.setItem(LEGACY_STORAGE_KEY, 'true');
      } catch {
        // Local storage is only a client-side UX hint; the background request persists consent.
      }

      void fetch('/api/compliance/research-consent', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = await readJsonSafely(response);
            throw new Error(getApiErrorMessage(payload, 'Unable to record consent.'));
          }

          const consentId = response.headers.get('x-revalin-consent-id')?.trim();
          const persistedAcceptedAt = response.headers.get('x-revalin-consent-accepted-at')?.trim();
          const termsVersion = response.headers.get('x-revalin-consent-terms-version')?.trim();

          if (!consentId && !persistedAcceptedAt && !termsVersion) return;

          try {
            window.localStorage.setItem(
              RESEARCH_CONSENT_STORAGE_KEY,
              JSON.stringify({
                consentId: consentId || 'queued',
                acceptedAt: persistedAcceptedAt || acceptedAt,
                termsVersion: termsVersion || RESEARCH_USE_TERMS_VERSION,
              }),
            );
          } catch {
            // The cookie and database record are authoritative.
          }
        })
        .catch((err) => {
          console.error('Failed to queue research access consent:', err);
        })
        .finally(() => {
          setIsSubmitting(false);
        });
    }, 0);
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
              className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#F4F1EA] shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="age-gate-title"
              aria-describedby="age-gate-description"
            >
              <div className="min-h-0 max-h-[440px] overflow-y-auto px-6 pb-3 pt-6 md:px-9 md:pt-7">
                {/* Logo */}
                <div className="flex flex-col items-center">
                  <LogoSvg className="h-auto w-32 text-[#0B2E2F]" />
                </div>

              {/* Divider */}
              <div className="my-4 h-px bg-[#0B2E2F]/10" />

              {/* Heading */}
              <h2
                id="age-gate-title"
                className="text-center text-xl font-semibold tracking-tight text-[#0B2E2F]"
              >
                Research-use agreement required
              </h2>
              <p className="mt-2 text-center text-[13px] leading-relaxed text-[#0B2E2F]/55">
                You must actively agree before entering Revalin.
              </p>

              {/* Info points */}
              <div className="mt-4 space-y-2">
                {INFO_POINTS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 rounded-xl bg-[#0B2E2F]/[0.04] px-4 py-2.5">
                    <Icon className="size-4 shrink-0 text-[#0B2E2F]/50" strokeWidth={1.5} />
                    <span className="text-[13px] text-[#0B2E2F]/70">{text}</span>
                  </div>
                ))}
              </div>

              {/* Research disclaimer */}
              <p
                id="age-gate-description"
                className="mt-4 text-center text-[12px] leading-relaxed text-[#0B2E2F]/50"
              >
                All products are strictly for research purposes only and are not intended for human consumption. These products have not been evaluated or approved by the FDA or Health Canada.
              </p>

              <div className="mt-4 rounded-xl border border-[#0B2E2F]/8 bg-white/50 px-4 py-3 text-center">
                <p className="text-[13px] font-medium text-[#0B2E2F]/80">
                  You must be 21 or older to browse this site.
                </p>
              </div>

              <div className="mt-5 border-t border-[#0B2E2F]/10 pt-4">
                <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                  Optional research details
                </p>
                <div className="space-y-2.5">
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
                    rows={2}
                    className="resize-none rounded-xl border border-[#0B2E2F]/10 bg-white/65 px-3 py-2 text-sm leading-5 text-[#0B2E2F] outline-none transition-colors placeholder:text-[#0B2E2F]/30 focus:border-[#0B2E2F]/35"
                    placeholder="Briefly describe the lawful research context"
                  />
                </label>
                </div>
                <p className="mt-3 text-center text-[10px] leading-4 text-[#0B2E2F]/45">
                  Leaving these fields blank records that no institution or research details were provided.
                </p>
              </div>
              </div>

              <div className="shrink-0 border-t border-[#0B2E2F]/10 bg-[#F4F1EA]/95 px-6 pb-3 pt-3 backdrop-blur md:px-9">
                <p className="mb-2 text-center text-[10px] leading-4 text-[#0B2E2F]/50">
                  This is the research-use access gate, separate from cookie consent.
                </p>
                <p className="mb-2 text-center text-[10px] leading-4 text-[#0B2E2F]/50">
                  By clicking Yes, you confirm you are 21 or older, are acting for lawful research purposes, and agree to our{' '}
                  <Link
                    className="underline underline-offset-2 hover:text-[#0B2E2F]/70"
                    href="/terms-of-service"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    className="underline underline-offset-2 hover:text-[#0B2E2F]/70"
                    href="/privacy-policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
                <button
                  onClick={handleAccept}
                  disabled={isSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0B2E2F] text-sm font-medium text-[#F4F1EA] transition-all hover:bg-[#0B2E2F]/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Entering site
                    </>
                  ) : (
                    'Yes, I agree and enter site'
                  )}
                </button>
                {error ? (
                  <p className="mt-3 text-center text-xs font-medium text-red-700">{error}</p>
                ) : null}
              </div>
            </motion.section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
