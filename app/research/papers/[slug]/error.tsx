"use client";

import { useEffect } from "react";

export default function PaperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[research/papers] render error", error);
  }, [error]);

  return (
    <div className="px-sides pt-top-spacing">
      <div className="mx-auto max-w-[60ch] py-16 text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#0B2E2F]/55">
          Research
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-[#0B2E2F]">
          This paper is temporarily unavailable
        </h1>
        <p className="mt-4 text-sm text-[#0B2E2F]/65">
          We hit a problem rendering this article. Please try again in a moment.
        </p>
        {error.digest ? (
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#0B2E2F]/40">
            ref: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-full border border-[#0B2E2F]/20 px-5 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[#0B2E2F] transition hover:bg-[#0B2E2F] hover:text-white"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
