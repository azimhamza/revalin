import type { MetadataRoute } from 'next';

const SITE_URL = 'https://revalin.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/account/',
          '/admin',
          '/admin/',
          '/affiliate/dashboard',
          '/affiliate/dashboard/',
          '/affiliate/signup',
          '/login',
          '/signup',
          '/verify-email',
          '/forgot-password',
          '/checkout',
          '/checkout/',
          '/order/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
