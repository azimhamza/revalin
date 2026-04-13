"use client";

import { useRef, useState } from "react";
import { Globe, Loader2, Plus, Trash2 } from "lucide-react";
import {
  SiInstagram,
  SiTiktok,
  SiX,
  SiFacebook,
  SiYoutube,
  SiPinterest,
  SiSnapchat,
  SiThreads,
} from "react-icons/si";
import { FaLinkedinIn } from "react-icons/fa";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import {
  MAX_AFFILIATE_SOCIAL_PROFILES,
  SOCIAL_PLATFORMS,
  type SocialPlatformValue,
} from "@/lib/checkout/affiliate-social-profiles";

const PLATFORM_ICONS: Record<SocialPlatformValue, React.ComponentType<{ className?: string }>> = {
  instagram: SiInstagram,
  tiktok: SiTiktok,
  twitter: SiX,
  facebook: SiFacebook,
  youtube: SiYoutube,
  linkedin: FaLinkedinIn,
  pinterest: SiPinterest,
  snapchat: SiSnapchat,
  threads: SiThreads,
  other: Globe,
};

type PromoterSignupFormProps = {
  initialName?: string;
  initialEmail?: string;
};

type SubmissionState =
  | { status: "idle"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SocialProfileRow = {
  id: string;
  platform: string;
  username: string;
};

function createEmptySocialProfile(id: number): SocialProfileRow {
  return { id: `social-profile-${id}`, platform: "", username: "" };
}

export function PromoterSignupForm({
  initialName = "",
  initialEmail = "",
}: PromoterSignupFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
    message: null,
  });
  const nextSocialProfileId = useRef(1);
  const [socialProfiles, setSocialProfiles] = useState<SocialProfileRow[]>([
    createEmptySocialProfile(0),
  ]);

  function updateSocialProfile(
    index: number,
    field: "platform" | "username",
    value: string,
  ) {
    setSocialProfiles((current) =>
      current.map((profile, currentIndex) =>
        currentIndex === index ? { ...profile, [field]: value } : profile,
      ),
    );
  }

  function addSocialProfile() {
    if (socialProfiles.length >= MAX_AFFILIATE_SOCIAL_PROFILES) return;

    const nextProfile = createEmptySocialProfile(nextSocialProfileId.current);
    nextSocialProfileId.current += 1;

    setSocialProfiles((current) =>
      current.length >= MAX_AFFILIATE_SOCIAL_PROFILES
        ? current
        : [...current, nextProfile],
    );
  }

  function removeSocialProfile(index: number) {
    setSocialProfiles((current) =>
      current.length === 1
        ? current
        : current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmission({ status: "idle", message: null });

    const filledProfiles = socialProfiles
      .map(({ platform, username }) => ({ platform, username }))
      .filter((p) => p.platform.trim() && p.username.trim());
    if (filledProfiles.length === 0) {
      setSubmission({
        status: "error",
        message: "Add at least one social profile for the admin team to review.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/promoter/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialProfiles: filledProfiles }),
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

        {socialProfiles.map((profile, index) => {
          const isOther = profile.platform === "other";
          const platformConfig = SOCIAL_PLATFORMS.find(
            (p) => p.value === profile.platform,
          );
          const PlatformIcon = profile.platform
            ? PLATFORM_ICONS[profile.platform as SocialPlatformValue]
            : null;

          return (
            <div
              key={profile.id}
              className="grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
                  Platform
                </span>
                <Select
                  value={profile.platform}
                  onValueChange={(value) =>
                    updateSocialProfile(index, "platform", value)
                  }
                  required
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border-border bg-background text-sm text-foreground">
                    <SelectValue placeholder="Select platform">
                      {platformConfig ? (
                        <>
                          {PlatformIcon ? <PlatformIcon className="size-4 shrink-0" /> : null}
                          {platformConfig.label}
                        </>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((p) => {
                      const Icon = PLATFORM_ICONS[p.value];
                      return (
                        <SelectItem key={p.value} value={p.value}>
                          <Icon className="size-4 shrink-0" />
                          {p.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${profile.id}-username`}
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55"
                >
                  {isOther ? "Profile URL" : "Username"}
                </label>
                <input
                  id={`${profile.id}-username`}
                  type="text"
                  value={profile.username}
                  onChange={(event) =>
                    updateSocialProfile(index, "username", event.target.value)
                  }
                  placeholder={isOther ? "https://example.com/profile" : "@yourhandle"}
                  required
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
                />
              </div>

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
          );
        })}
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
