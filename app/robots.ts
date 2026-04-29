import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

const SITE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/admin',
          '/affiliate/dashboard',
          '/affiliate/signup',
          '/promoter/dashboard',
          '/promoter/signup',
          '/login',
          '/signup',
          '/verify-email',
          '/forgot-password',
          '/checkout',
          '/auth/',
          '/order/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
