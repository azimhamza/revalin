'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';

const STORAGE_KEY = 'revalin_research_disclaimer_v1';
const ACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredAck = {
  acceptedAt: number;
  expiresAt: number;
};

export function ResearchDisclaimerPopup() {
  const [isOpen, setIsOpen] = useState(false);
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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsOpen(true);
        return;
      }

      const parsed = JSON.parse(raw) as StoredAck;
      if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
        setIsOpen(true);
        return;
      }

      setIsOpen(false);
    } catch {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    const now = Date.now();
    const payload: StoredAck = {
      acceptedAt: now,
      expiresAt: now + ACK_TTL_MS,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // If storage is unavailable, keep a session-only acknowledgement.
    }

    setIsOpen(false);
  };

  const handleExit = () => {
    window.location.href = '/';
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
            className="fixed inset-0 z-[80] bg-foreground/50 backdrop-blur-sm p-4"
          >
            <div className="h-full w-full grid place-items-center">
              <motion.section
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className="relative w-full max-w-lg overflow-hidden rounded-md border border-border bg-card p-6 md:p-7 shadow-2xl"
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

                <div className="relative">
                  <p className="text-xs font-semibold tracking-[0.15em] text-foreground/60 uppercase mb-2">
                    Research Knowledge Access
                  </p>
                  <h2 id="research-disclaimer-title" className="text-2xl font-semibold mb-3">
                    Research Purposes Only
                  </h2>
                  <p id="research-disclaimer-description" className="text-sm text-muted-foreground">
                    This section is provided strictly for educational and laboratory research context. By continuing,
                    you confirm you are at least 18 years old and understand this content is not for human consumption
                    or medical use.
                  </p>

                  <div className="mt-5 rounded border border-border/70 bg-background/50 p-3 text-xs text-foreground/75">
                    I confirm I am 18+ and accessing this material for lawful research purposes only.
                  </div>

                  <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button variant="outline" onClick={handleExit} className="sm:min-w-28">
                      Leave
                    </Button>
                    <Button onClick={handleAccept} className="sm:min-w-44">
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
