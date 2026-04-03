export type AffiliateSocialProfile = {
  platform: string;
  url: string;
};

export const MAX_AFFILIATE_SOCIAL_PROFILES = 6;

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
