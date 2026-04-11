"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MAX_AFFILIATE_SOCIAL_PROFILES,
  type AffiliateSocialProfile,
} from "@/lib/checkout/affiliate-social-profiles";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type AffiliateSignupFormProps = {
  initialName?: string;
  initialEmail?: string;
  promoterFirstName?: string | null;
};

type SubmissionState =
  | { status: "idle"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function createEmptySocialProfile(): AffiliateSocialProfile {
  return { platform: "", url: "" };
}

export function AffiliateSignupForm({
  initialName = "",
  initialEmail = "",
  promoterFirstName = null,
}: AffiliateSignupFormProps) {
  const searchParams = useSearchParams();
  const promoterReferralCode = searchParams.get("promoter")?.trim() || "";
  const [socialProfiles, setSocialProfiles] = useState<
    AffiliateSocialProfile[]
  >([createEmptySocialProfile()]);
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
      const response = await fetch("/api/affiliate/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          socialProfiles,
          promoterReferralCode: promoterReferralCode || undefined,
        }),
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
          "Application received. The admin team will assign your partner code and email you when the referral setup is approved.",
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

  function updateSocialProfile(
    index: number,
    field: keyof AffiliateSocialProfile,
    value: string,
  ) {
    setSocialProfiles((current) =>
      current.map((profile, currentIndex) =>
        currentIndex === index ? { ...profile, [field]: value } : profile,
      ),
    );
  }

  function addSocialProfile() {
    setSocialProfiles((current) =>
      current.length >= MAX_AFFILIATE_SOCIAL_PROFILES
        ? current
        : [...current, createEmptySocialProfile()],
    );
  }

  function removeSocialProfile(index: number) {
    setSocialProfiles((current) =>
      current.length === 1
        ? [createEmptySocialProfile()]
        : current.filter((_, currentIndex) => currentIndex !== index),
    );
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
          {initialName || "Growth Partner applicant"}
        </p>
        <p className="text-sm text-foreground/60">
          {initialEmail || "No email available"}
        </p>
        {promoterReferralCode ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-foreground/60">
            {promoterFirstName
              ? `${promoterFirstName} invited you to join the Growth Partner Program.`
              : "You were invited to join the Growth Partner Program."}{" "}
            <span className="font-mono font-semibold text-foreground">
              {promoterReferralCode}
            </span>
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
              Social profiles
            </p>
            <p className="mt-1 text-sm text-foreground/60">
              Add the channels the admin team should review before approval.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSocialProfile}
            disabled={socialProfiles.length >= MAX_AFFILIATE_SOCIAL_PROFILES}
          >
            <Plus className="size-4" />
            Add profile
          </Button>
        </div>

        {socialProfiles.map((profile, index) => (
          <div
            key={`${index}-${profile.platform}-${profile.url}`}
            className="grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
                Platform
              </span>
              <input
                type="text"
                value={profile.platform}
                onChange={(event) =>
                  updateSocialProfile(index, "platform", event.target.value)
                }
                placeholder="Instagram"
                required
                className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
                Profile URL
              </span>
              <input
                type="text"
                value={profile.url}
                onChange={(event) =>
                  updateSocialProfile(index, "url", event.target.value)
                }
                placeholder="https://instagram.com/your-handle"
                required
                autoCapitalize="off"
                spellCheck={false}
                className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
              />
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeSocialProfile(index)}
                disabled={socialProfiles.length === 1}
                aria-label={`Remove social profile ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
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
          "Request Growth Partner access"
        )}
      </Button>
    </form>
  );
}
