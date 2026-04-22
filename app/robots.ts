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
          '/account/',
          '/admin',
          '/admin/',
          '/affiliate/dashboard',
          '/affiliate/dashboard/',
          '/affiliate/signup',
          '/promoter/dashboard',
          '/promoter/dashboard/',
          '/promoter/signup',
          '/login',
          '/login/',
          '/signup',
          '/signup/',
          '/verify-email',
          '/verify-email/',
          '/forgot-password',
          '/forgot-password/',
          '/checkout',
          '/checkout/',
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
