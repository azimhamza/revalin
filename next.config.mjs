const DEFAULT_SITE_URL = 'https://revalin.ca';
const KNOWN_SITE_HOSTS = ['revalin.ca', 'www.revalin.ca', 'revalin.com', 'www.revalin.com'];

function normalizeSiteUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL) ?? DEFAULT_SITE_URL;
const canonicalHost = new URL(siteUrl).hostname;
const alternateHosts = KNOWN_SITE_HOSTS.filter(host => host !== canonicalHost);

const nextConfig = {
  trailingSlash: false,
  experimental: {
    inlineCss: process.env.NODE_ENV === 'production',
    useCache: true,
    clientSegmentCache: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return alternateHosts.map(host => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: `${siteUrl}/:path*`,
      permanent: true,
    }));
  },
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.swell.store',
      },
      {
        protocol: 'https',
        hostname: 'cdn.swell.store',
      },
      {
        protocol: 'https',
        hostname: 'zylq-002.dx.commercecloud.salesforce.com',
      },
      {
        protocol: 'https',
        hostname: 'edge.disstg.commercecloud.salesforce.com',
      },
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
