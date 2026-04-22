const DEFAULT_SITE_URL = 'https://revalin.ca';

const KNOWN_SITE_HOSTS = ['revalin.ca', 'www.revalin.ca', 'revalin.com', 'www.revalin.com'] as const;

function normalizeSiteUrl(value?: string | null) {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL) ?? DEFAULT_SITE_URL;
}

export function getSiteHostname() {
  return new URL(getSiteUrl()).hostname;
}

export function getAlternateSiteHosts() {
  const canonicalHost = getSiteHostname();
  return KNOWN_SITE_HOSTS.filter(host => host !== canonicalHost);
}

export function resolveSiteUrl(pathOrUrl: string) {
  try {
    return new URL(pathOrUrl).toString();
  } catch {
    const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${getSiteUrl()}${normalizedPath}`;
  }
}
