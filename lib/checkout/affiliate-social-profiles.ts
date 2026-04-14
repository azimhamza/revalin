export type AffiliateSocialProfile = {
  platform: string;
  url: string;
};

export const MAX_AFFILIATE_SOCIAL_PROFILES = 6;

export const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram", baseUrl: "https://instagram.com/" },
  { value: "tiktok", label: "TikTok", baseUrl: "https://tiktok.com/@" },
  { value: "twitter", label: "X (Twitter)", baseUrl: "https://x.com/" },
  { value: "facebook", label: "Facebook", baseUrl: "https://facebook.com/" },
  { value: "youtube", label: "YouTube", baseUrl: "https://youtube.com/@" },
  { value: "linkedin", label: "LinkedIn", baseUrl: "https://linkedin.com/in/" },
  { value: "pinterest", label: "Pinterest", baseUrl: "https://pinterest.com/" },
  { value: "snapchat", label: "Snapchat", baseUrl: "https://snapchat.com/add/" },
  { value: "threads", label: "Threads", baseUrl: "https://threads.net/@" },
  { value: "other", label: "Other", baseUrl: null },
] as const;

export type SocialPlatformValue = (typeof SOCIAL_PLATFORMS)[number]["value"];

const platformBaseUrlEntries: Array<[string, string]> = SOCIAL_PLATFORMS.flatMap(
  (platform) =>
    platform.baseUrl ? [[platform.value, platform.baseUrl]] : [],
);
const platformBaseUrls = new Map<string, string>(
  platformBaseUrlEntries,
);

export function buildProfileUrl(platform: string, username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "";

  const baseUrl = platformBaseUrls.get(platform);
  if (!baseUrl) {
    // "other" platform — username is a full URL
    return normalizeAffiliateSocialUrl(trimmed);
  }

  // Strip leading @ if present
  const handle = trimmed.replace(/^@/, "");
  return `${baseUrl}${handle}`;
}

export function normalizeAffiliateSocialUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function normalizeAffiliateSocialProfiles(
  profiles: AffiliateSocialProfile[],
) {
  return profiles
    .map((profile) => ({
      platform: profile.platform.trim(),
      url: normalizeAffiliateSocialUrl(profile.url),
    }))
    .filter((profile) => profile.platform && profile.url);
}
