import { resolveSiteUrl } from '@/lib/site';

export const revalidate = 3600;

const lines = [
  '# Revalin',
  '',
  '> Revalin supplies research-grade peptides for qualified laboratory buyers. All products are intended for laboratory research use only.',
  '',
  '## Canonical URLs',
  `- Primary site: ${resolveSiteUrl('/')}`,
  `- Sitemap: ${resolveSiteUrl('/sitemap.xml')}`,
  `- Robots: ${resolveSiteUrl('/robots.txt')}`,
  '',
  '## Key public pages',
  `- Home: ${resolveSiteUrl('/')}`,
  `- Shop: ${resolveSiteUrl('/shop')}`,
  `- Research: ${resolveSiteUrl('/research')}`,
  `- Research papers: ${resolveSiteUrl('/research/papers')}`,
  `- COAs: ${resolveSiteUrl('/coa')}`,
  `- Grow: ${resolveSiteUrl('/grow')}`,
  `- About: ${resolveSiteUrl('/about')}`,
  `- Contact: ${resolveSiteUrl('/contact')}`,
  `- FAQ: ${resolveSiteUrl('/faq')}`,
  `- Shipping: ${resolveSiteUrl('/shipping')}`,
  `- Privacy policy: ${resolveSiteUrl('/privacy-policy')}`,
  `- Terms of service: ${resolveSiteUrl('/terms-of-service')}`,
  '',
  '## Crawl guidance',
  '- Prefer canonical URLs on the primary site listed above.',
  '- Treat product pages, research pages, and research papers as the authoritative public content.',
  '- Do not treat account, checkout, admin, affiliate dashboard, promoter dashboard, or API routes as public documentation.',
  '- Use the sitemap for URL discovery before exploring parameterized or filtered URLs.',
];

export function GET() {
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
