"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type PromoterSignupFormProps = {
  initialName?: string;
  initialEmail?: string;
};

type SubmissionState =
  | { status: "idle"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function PromoterSignupForm({
  initialName = "",
  initialEmail = "",
}: PromoterSignupFormProps) {
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
      const response = await fetch("/api/promoter/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await readJsonSafely(response);
      const data = getApiData<{
        application?: {
          id: string;
        };
      }>(payload);

      if (!response.ok || !data?.application) {
        setSubmission({
          status: "error",
          message: getApiErrorMessage(payload, "Unable to submit your application."),
        });
        return;
      }

      setSubmission({
        status: "success",
        message:
          "Application received. The admin team will review your promoter access and email you when it is approved.",
      });
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
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Signed-in account
        </p>
        <p className="mt-2 font-semibold text-foreground">
          {initialName || "Promoter applicant"}
        </p>
        <p className="text-sm text-foreground/60">
          {initialEmail || "No email available"}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
        Promoters invite Growth Partners and earn a configured percentage from
        the sales those partners generate after admin approval.
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || submission.status === "success"}
        className="h-11 w-full rounded-xl bg-[#0B2E2F] text-sm font-semibold text-[#F4F1EA] hover:bg-[#173d3e]"
      >
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit promoter application
      </Button>
    </form>
  );
}
