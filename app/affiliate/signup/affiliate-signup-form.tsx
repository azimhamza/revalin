"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type AffiliateSignupFormProps = {
  initialName?: string;
  initialEmail?: string;
  isSignedIn?: boolean;
};

type SubmissionState =
  | { status: "idle"; message: null }
  | { status: "success"; message: string; code: string }
  | { status: "error"; message: string };

function sanitizeCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AffiliateSignupForm({
  initialName = "",
  initialEmail = "",
  isSignedIn = false,
}: AffiliateSignupFormProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
    message: null,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmission({ status: "idle", message: null });
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/affiliate/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          code,
          walletAddress,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            application?: {
              code: string;
            };
          }
        | null;

      if (!response.ok || !data?.application) {
        setSubmission({
          status: "error",
          message: data?.error || "Unable to submit your application.",
        });
        return;
      }

      setSubmission({
        status: "success",
        message:
          "Application received. We’ll review it in the admin panel and email you once the referral code is approved.",
        code: data.application.code,
      });
      setCode(data.application.code);
    } catch {
      setSubmission({
        status: "error",
        message: "Unable to submit your application.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {submission.status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submission.message}
        </div>
      ) : null}

      {submission.status === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p>{submission.message}</p>
          <p className="mt-2 font-semibold">
            Reserved referral route: <span className="font-mono">/{submission.code}</span>
          </p>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Full name
        </span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Jane Doe"
          required
          autoComplete="name"
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Referral code
        </span>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(sanitizeCode(event.target.value))}
          placeholder="your-lab-handle"
          required
          minLength={3}
          autoCapitalize="off"
          spellCheck={false}
          className="h-11 rounded-xl border border-border bg-background px-3.5 font-mono text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
        <p className="text-xs text-foreground/55">
          Your approved referral route will look like <span className="font-mono">/{code || "your-code"}</span>.
        </p>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Payout wallet
        </span>
        <input
          type="text"
          value={walletAddress}
          onChange={(event) => setWalletAddress(event.target.value)}
          placeholder="USDC wallet address"
          required
          autoCapitalize="off"
          spellCheck={false}
          className="h-11 rounded-xl border border-border bg-background px-3.5 font-mono text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
        <p>
          Applications land in the admin queue first. Approved partners receive a discount code, payout tracking,
          and a live dashboard tied to the email on this application.
        </p>
        {!isSignedIn ? (
          <p className="mt-2">
            Already have an account?{" "}
            <Link href="/login?callbackUrl=/affiliate/signup" className="font-semibold text-[#0B2E2F] underline underline-offset-2">
              Sign in before applying
            </Link>
            .
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isSubmitting}
        style={{ backgroundColor: "#0B2E2F", color: "#F4F1EA" }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Submitting application...
          </>
        ) : (
          "Apply for Growth Partner access"
        )}
      </Button>
    </form>
  );
}
