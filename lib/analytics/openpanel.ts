import { OpenPanel } from '@openpanel/nextjs';

// Server-side OpenPanel client for tracking from API routes and server components
export const op = new OpenPanel({
  clientId: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID!,
  clientSecret: process.env.OPENPANEL_CLIENT_SECRET!,
});

const EXPORT_BASE = 'https://api.openpanel.dev/export';
const INSIGHTS_BASE = 'https://api.openpanel.dev/insights';

function getOpenPanelCredentials() {
  const clientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
  const clientSecret = process.env.OPENPANEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function hasOpenPanelCredentials() {
  return Boolean(getOpenPanelCredentials());
}

function opHeaders() {
  const credentials = getOpenPanelCredentials();
  if (!credentials) return null;

  return {
    'openpanel-client-id': credentials.clientId,
    'openpanel-client-secret': credentials.clientSecret,
    'Content-Type': 'application/json',
  };
}

function projectId() {
  return getOpenPanelCredentials()?.clientId ?? null;
}

async function fetchOpenPanel(url: string, context: string) {
  const headers = opHeaders();
  if (!headers) return null;

  const res = await fetch(url, { headers, next: { revalidate: 300 } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[OPENPANEL] ${context} failed`, {
      status: res.status,
      body,
    });
    return null;
  }

  return res.json();
}

export async function getAffiliateChartData(affiliateCode: string, range = '30d') {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${EXPORT_BASE}/charts`);
  url.searchParams.set('projectId', openPanelProjectId);
  url.searchParams.set(
    'series',
    JSON.stringify([
      {
        name: 'affiliate_visit',
        segment: 'user',
        filters: [
          {
            name: 'properties.affiliate_code',
            operator: 'is',
            value: [affiliateCode],
          },
        ],
      },
    ])
  );
  url.searchParams.set('interval', 'day');
  url.searchParams.set('range', range);

  return fetchOpenPanel(url.toString(), 'affiliate chart export');
}

export async function getAffiliateEvents(
  affiliateCode: string,
  opts: { event?: string; start?: string; end?: string } = {}
) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${EXPORT_BASE}/events`);
  url.searchParams.set('projectId', openPanelProjectId);
  if (opts.event) url.searchParams.set('event', opts.event);
  if (opts.start) url.searchParams.set('start', opts.start);
  if (opts.end) url.searchParams.set('end', opts.end);
  url.searchParams.set('includes', 'properties');

  const data = await fetchOpenPanel(url.toString(), 'affiliate event export');
  if (!data) return [];
  // Filter for the specific affiliate code
  return (data.data || data.events || data || []).filter(
    (e: any) => e.properties?.affiliate_code === affiliateCode
  );
}

export async function getAffiliateRevenue(affiliateCode: string, range = '30d') {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${EXPORT_BASE}/charts`);
  url.searchParams.set('projectId', openPanelProjectId);
  url.searchParams.set(
    'series',
    JSON.stringify([
      {
        name: 'purchase',
        segment: 'property_sum',
        property: 'properties.orderTotal',
        filters: [
          {
            name: 'properties.affiliate_code',
            operator: 'is',
            value: [affiliateCode],
          },
        ],
      },
    ])
  );
  url.searchParams.set('interval', 'day');
  url.searchParams.set('range', range);

  return fetchOpenPanel(url.toString(), 'affiliate revenue export');
}

export async function getSiteMetrics(range = '30d') {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/metrics`);
  url.searchParams.set('range', range);

  const data = await fetchOpenPanel(url.toString(), 'site metrics insight');
  return data?.metrics ?? data;
}

export async function getTopPages(range = '30d', limit = 20) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/pages`);
  url.searchParams.set('range', range);
  url.searchParams.set('limit', String(limit));

  return (await fetchOpenPanel(url.toString(), 'top pages insight')) ?? [];
}

export async function getReferrerData(range = '30d', limit = 20) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/referrer`);
  url.searchParams.set('range', range);
  url.searchParams.set('limit', String(limit));

  return (await fetchOpenPanel(url.toString(), 'referrer insight')) ?? [];
}
