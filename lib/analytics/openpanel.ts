import { OpenPanel } from "@openpanel/nextjs";

const publicClientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID?.trim();
const serverClientSecret = process.env.OPENPANEL_CLIENT_SECRET?.trim();
const insightsClientId =
  process.env.OPENPANEL_INSIGHTS_CLIENT_ID?.trim() ??
  process.env.OPENPANEL_READ_CLIENT_ID?.trim() ??
  publicClientId;
const insightsClientSecret =
  process.env.OPENPANEL_INSIGHTS_CLIENT_SECRET?.trim() ??
  process.env.OPENPANEL_READ_CLIENT_SECRET?.trim() ??
  serverClientSecret;
const insightsProjectId = process.env.OPENPANEL_PROJECT_ID?.trim();

let trackingClient: OpenPanel | null = null;

export function hasOpenPanelTrackingConfig() {
  return Boolean(publicClientId && serverClientSecret);
}

function getOpenPanelTrackingClient() {
  if (!hasOpenPanelTrackingConfig()) {
    throw new Error(
      "Missing OpenPanel tracking configuration: NEXT_PUBLIC_OPENPANEL_CLIENT_ID and OPENPANEL_CLIENT_SECRET are required.",
    );
  }

  if (!trackingClient) {
    trackingClient = new OpenPanel({
      clientId: publicClientId!,
      clientSecret: serverClientSecret!,
    });
  }

  return trackingClient;
}

export async function trackOpenPanelServerEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  return getOpenPanelTrackingClient().track(eventName, properties ?? {});
}

const EXPORT_BASE = "https://api.openpanel.dev/export";
const INSIGHTS_BASE = "https://api.openpanel.dev/insights";
const DEFAULT_OPENPANEL_FETCH_TIMEOUT_MS = 2_000;

type OpenPanelInsightsCredentials = {
  clientId: string;
  clientSecret: string;
  projectId: string;
};

export type OpenPanelFilter = {
  name: string;
  operator: string;
  value: Array<string | number | boolean>;
};

type OpenPanelChartSeriesInput = {
  name: string;
  segment?:
    | "event"
    | "user"
    | "session"
    | "user_average"
    | "one_event_per_user"
    | "property_sum"
    | "property_average"
    | "property_min"
    | "property_max";
  property?: string;
  filters?: OpenPanelFilter[];
};

type OpenPanelChartBreakdown = {
  name: string;
};

export type OpenPanelSiteMetricPoint = {
  date: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  bounceRate: number | null;
  avgSessionDuration: number | null;
  viewsPerSession: number | null;
};

export type OpenPanelSiteMetrics = {
  visitors: number | null;
  sessions: number | null;
  pageViews: number | null;
  bounceRate: number | null;
  avgSessionDuration: number | null;
  viewsPerSession: number | null;
  series: OpenPanelSiteMetricPoint[];
};

export type OpenPanelNamedValue = {
  name: string;
  value: number;
};

export type OpenPanelChartPoint = {
  date: string;
  count: number;
  value: number;
  previousValue: number | null;
  previousChange: number | null;
};

export type OpenPanelChartSeries = {
  id: string;
  name: string;
  label: string;
  breakdown: string | null;
  metricSum: number;
  metricAverage: number | null;
  metricMin: number | null;
  metricMax: number | null;
  previousSum: number | null;
  previousChange: number | null;
  data: OpenPanelChartPoint[];
};

export type OpenPanelChartResult = {
  series: OpenPanelChartSeries[];
};

export type OpenPanelEventRecord = {
  id?: string;
  name?: string;
  event?: string;
  timestamp?: string;
  createdAt?: string;
  created_at?: string;
  time?: string;
  device?: string | null;
  referrer?: string | null;
  referrerName?: string | null;
  country?: string | null;
  properties?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type OpenPanelEventPage = {
  events: OpenPanelEventRecord[];
  page: number;
  totalPages: number;
};

export type AdminAffiliateTrendPoint = {
  date: string;
  visits: number;
  purchases: number;
  revenue: number;
};

export type AffiliateTelemetryTrendPoint = {
  date: string;
  visits: number;
  purchases: number;
  revenue: number;
  conversionRate: number | null;
};

export type AffiliateOpenPanelTelemetry = {
  trend: AffiliateTelemetryTrendPoint[];
  events: OpenPanelEventRecord[];
  devices: OpenPanelNamedValue[];
  countries: OpenPanelNamedValue[];
  referrers: OpenPanelNamedValue[];
  sources: OpenPanelNamedValue[];
  utmSources: OpenPanelNamedValue[];
  utmMediums: OpenPanelNamedValue[];
  utmCampaigns: OpenPanelNamedValue[];
  landingPaths: OpenPanelNamedValue[];
};

export type AdminAffiliateLeaderboardEntry = {
  affiliateCode: string;
  visits: number;
  purchases: number;
  revenue: number;
  conversionRate: number | null;
  avgOrderValue: number | null;
};

export type AdminAffiliateTelemetry = {
  trend: AdminAffiliateTrendPoint[];
  leaderboard: AdminAffiliateLeaderboardEntry[];
  devices: OpenPanelNamedValue[];
  referrers: OpenPanelNamedValue[];
  countries: OpenPanelNamedValue[];
};

function toNumberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumberOrZero(value: unknown) {
  return toNumberOrNull(value) ?? 0;
}

function getOpenPanelInsightsCredentials(): OpenPanelInsightsCredentials | null {
  if (!insightsClientId || !insightsClientSecret || !insightsProjectId) {
    return null;
  }

  return {
    clientId: insightsClientId,
    clientSecret: insightsClientSecret,
    projectId: insightsProjectId,
  };
}

export function hasOpenPanelCredentials() {
  return Boolean(getOpenPanelInsightsCredentials());
}

export function getOpenPanelMissingConfig() {
  const missing: string[] = [];

  if (!insightsProjectId) {
    missing.push("OPENPANEL_PROJECT_ID");
  }

  if (!insightsClientId) {
    missing.push("OPENPANEL_INSIGHTS_CLIENT_ID or OPENPANEL_READ_CLIENT_ID");
  }

  if (!insightsClientSecret) {
    missing.push(
      "OPENPANEL_INSIGHTS_CLIENT_SECRET or OPENPANEL_READ_CLIENT_SECRET",
    );
  }

  return missing;
}

function opHeaders() {
  const credentials = getOpenPanelInsightsCredentials();
  if (!credentials) return null;

  return {
    "openpanel-client-id": credentials.clientId,
    "openpanel-client-secret": credentials.clientSecret,
    "Content-Type": "application/json",
  };
}

function getOpenPanelFetchTimeoutMs() {
  const configured = Number(process.env.OPENPANEL_FETCH_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OPENPANEL_FETCH_TIMEOUT_MS;
}

function createOpenPanelTimeoutSignal() {
  const timeout = (
    AbortSignal as typeof AbortSignal & {
      timeout?: (milliseconds: number) => AbortSignal;
    }
  ).timeout;

  return typeof timeout === "function"
    ? timeout(getOpenPanelFetchTimeoutMs())
    : undefined;
}

function projectId() {
  return getOpenPanelInsightsCredentials()?.projectId ?? null;
}

function formatOpenPanelFailure(status: number, body: string) {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  const truncatedBody =
    normalizedBody.length > 280
      ? `${normalizedBody.slice(0, 277)}...`
      : normalizedBody;

  return truncatedBody
    ? `status=${status} body=${truncatedBody}`
    : `status=${status}`;
}

function withJsonParam(url: URL, key: string, value: unknown) {
  if (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return;
  }

  url.searchParams.set(key, JSON.stringify(value));
}

function normalizeChartSeries(rawSeries: any): OpenPanelChartSeries {
  const names = Array.isArray(rawSeries?.names)
    ? rawSeries.names.map((entry: unknown) => String(entry))
    : [];
  const name =
    names[0] ||
    (typeof rawSeries?.name === "string" ? rawSeries.name : "series");
  const breakdown = names.length > 1 ? names[names.length - 1] : null;
  const data = (
    Array.isArray(rawSeries?.data)
      ? rawSeries.data
          .map((point: any) => {
            const date = point?.date ?? point?.day ?? point?.start ?? point?.ts;
            if (!date) return null;

            return {
              date: String(date),
              count: toNumberOrZero(point?.count ?? point?.value ?? point?.sum),
              value: toNumberOrZero(point?.value ?? point?.sum ?? point?.count),
              previousValue: toNumberOrNull(
                point?.previous?.value ?? point?.previous?.sum,
              ),
              previousChange: toNumberOrNull(point?.previous?.change),
            } satisfies OpenPanelChartPoint;
          })
          .filter(Boolean)
      : []
  ) as OpenPanelChartPoint[];
  const metrics = rawSeries?.metrics ?? rawSeries?.metric ?? {};
  const metricSum =
    toNumberOrNull(metrics?.sum ?? rawSeries?.sum) ??
    data.reduce(
      (sum: number, point: OpenPanelChartPoint) => sum + point.value,
      0,
    );

  return {
    id: String(rawSeries?.id ?? `${name}-${breakdown ?? "all"}`),
    name,
    label: breakdown ? `${name} • ${breakdown}` : name,
    breakdown,
    metricSum,
    metricAverage: toNumberOrNull(metrics?.average ?? rawSeries?.average),
    metricMin: toNumberOrNull(metrics?.min ?? rawSeries?.min),
    metricMax: toNumberOrNull(metrics?.max ?? rawSeries?.max),
    previousSum: toNumberOrNull(
      metrics?.previous?.sum ?? rawSeries?.previous?.sum,
    ),
    previousChange: toNumberOrNull(
      metrics?.previous?.change ?? rawSeries?.previous?.change,
    ),
    data,
  };
}

function normalizeEventPage(data: any, page: number): OpenPanelEventPage {
  const events = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.events)
      ? data.events
      : Array.isArray(data)
        ? data
        : [];
  const meta = data?.meta ?? {};

  return {
    events: events as OpenPanelEventRecord[],
    page: toNumberOrNull(meta?.page ?? data?.page) ?? page,
    totalPages: toNumberOrNull(meta?.pages ?? data?.pages) ?? 1,
  };
}

function normalizeInsightNamedValues(data: any) {
  const entries = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

  return entries
    .map((entry: any) => ({
      name: String(
        entry?.name ??
          entry?.country ??
          entry?.device ??
          entry?.label ??
          "Unknown",
      ),
      value: toNumberOrZero(
        entry?.sessions ?? entry?.count ?? entry?.views ?? entry?.value,
      ),
    }))
    .filter((entry: OpenPanelNamedValue) => entry.value > 0);
}

function normalizeSiteMetricSeries(data: any): OpenPanelSiteMetricPoint[] {
  const series = Array.isArray(data?.series)
    ? data.series
    : Array.isArray(data?.metrics?.series)
      ? data.metrics.series
      : Array.isArray(data?.data?.series)
        ? data.data.series
        : [];

  return series
    .map((entry: any) => {
      const date = entry?.date ?? entry?.day ?? entry?.start ?? entry?.ts;
      if (!date) return null;

      return {
        date: String(date),
        visitors: toNumberOrZero(
          entry?.unique_visitors ?? entry?.visitors ?? entry?.current_visitors,
        ),
        sessions: toNumberOrZero(
          entry?.total_sessions ?? entry?.sessions ?? entry?.count,
        ),
        pageViews: toNumberOrZero(
          entry?.total_screen_views ?? entry?.pageviews ?? entry?.page_views,
        ),
        bounceRate: toNumberOrNull(entry?.bounce_rate),
        avgSessionDuration: toNumberOrNull(entry?.avg_session_duration),
        viewsPerSession: toNumberOrNull(entry?.views_per_session),
      } satisfies OpenPanelSiteMetricPoint;
    })
    .filter(Boolean) as OpenPanelSiteMetricPoint[];
}

function rangeToStartTimestamp(range: string) {
  const match = range.trim().match(/^(\d+)([dh])$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const durationMs =
    unit === "h" ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;

  return new Date(Date.now() - durationMs).toISOString();
}

function sortNamedValues(values: Map<string, number>, limit = 6) {
  return Array.from(values.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function normalizeReferrerLabel(
  value: string | null | undefined,
  fallback = "Direct / unknown",
) {
  if (!value) return fallback;

  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function getEventProperties(event: OpenPanelEventRecord) {
  return event?.properties && typeof event.properties === "object"
    ? (event.properties as Record<string, unknown>)
    : {};
}

function getStringProperty(
  properties: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizePathLabel(
  value: string | null | undefined,
  fallback = "/unknown",
) {
  if (!value) return fallback;

  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}` || fallback;
  } catch {
    return value.startsWith("/") ? value : `/${value}`;
  }
}

async function fetchOpenPanel(url: string, context: string) {
  const headers = opHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 300 },
      signal: createOpenPanelTimeoutSignal(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[OPENPANEL] ${context} failed ${formatOpenPanelFailure(res.status, body)}`,
      );
      return null;
    }

    return res.json();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OpenPanel error";
    console.warn(`[OPENPANEL] ${context} failed ${message}`);
    return null;
  }
}

export async function getOpenPanelChart(args: {
  series: OpenPanelChartSeriesInput[];
  range?: string;
  interval?: "hour" | "day" | "week" | "month";
  breakdowns?: OpenPanelChartBreakdown[];
}) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${EXPORT_BASE}/charts`);
  url.searchParams.set("projectId", openPanelProjectId);
  url.searchParams.set("range", args.range ?? "30d");
  url.searchParams.set("interval", args.interval ?? "day");
  withJsonParam(url, "series", args.series);
  withJsonParam(url, "breakdowns", args.breakdowns);

  const data = await fetchOpenPanel(url.toString(), "chart export");
  if (!data) return null;

  const rawSeries = Array.isArray(data?.series)
    ? data.series
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

  return {
    series: rawSeries.map(normalizeChartSeries),
  } satisfies OpenPanelChartResult;
}

async function getOpenPanelEventPage(args: {
  event?: string;
  start?: string;
  end?: string;
  includes?: string[];
  page?: number;
  limit?: number;
}) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) {
    return {
      events: [],
      page: args.page ?? 1,
      totalPages: 1,
    } satisfies OpenPanelEventPage;
  }

  const url = new URL(`${EXPORT_BASE}/events`);
  url.searchParams.set("projectId", openPanelProjectId);
  url.searchParams.set("page", String(args.page ?? 1));
  url.searchParams.set("limit", String(args.limit ?? 250));
  if (args.event) url.searchParams.set("event", args.event);
  if (args.start) url.searchParams.set("start", args.start);
  if (args.end) url.searchParams.set("end", args.end);
  if (args.includes?.length) {
    url.searchParams.set("includes", args.includes.join(","));
  }

  const data = await fetchOpenPanel(url.toString(), "event export");
  if (!data) {
    return {
      events: [],
      page: args.page ?? 1,
      totalPages: 1,
    } satisfies OpenPanelEventPage;
  }

  return normalizeEventPage(data, args.page ?? 1);
}

export async function getAllOpenPanelEvents(args: {
  event?: string;
  start?: string;
  end?: string;
  includes?: string[];
  limit?: number;
  maxPages?: number;
}) {
  const limit = args.limit ?? 250;
  const maxPages = args.maxPages ?? 4;
  const events: OpenPanelEventRecord[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await getOpenPanelEventPage({
      ...args,
      page,
      limit,
    });

    events.push(...response.events);

    if (page >= response.totalPages || response.events.length < limit) {
      break;
    }
  }

  return events;
}

export async function getAffiliateChartData(
  affiliateCode: string,
  range = "30d",
) {
  return getOpenPanelChart({
    range,
    interval: "day",
    series: [
      {
        name: "affiliate_visit",
        segment: "user",
        filters: [
          {
            name: "properties.affiliate_code",
            operator: "is",
            value: [affiliateCode],
          },
        ],
      },
    ],
  });
}

export async function getAffiliateEvents(
  affiliateCode: string,
  opts: { event?: string; start?: string; end?: string } = {},
) {
  const data = await getAllOpenPanelEvents({
    event: opts.event,
    start: opts.start,
    end: opts.end,
    includes: ["properties", "device", "referrer", "referrerName", "country"],
  });

  return data.filter(
    (e: any) => e.properties?.affiliate_code === affiliateCode,
  );
}

export async function getAffiliateRevenue(
  affiliateCode: string,
  range = "30d",
) {
  return getOpenPanelChart({
    range,
    interval: "day",
    series: [
      {
        name: "purchase",
        segment: "property_sum",
        property: "properties.orderTotal",
        filters: [
          {
            name: "properties.affiliate_code",
            operator: "is",
            value: [affiliateCode],
          },
        ],
      },
    ],
  });
}

export async function getAffiliateOpenPanelTelemetry(
  affiliateCode: string,
  range = "30d",
): Promise<AffiliateOpenPanelTelemetry | null> {
  const start = rangeToStartTimestamp(range) ?? undefined;
  const affiliateFilter: OpenPanelFilter = {
    name: "properties.affiliate_code",
    operator: "is",
    value: [affiliateCode],
  };

  const [
    visitTrend,
    purchaseTrend,
    revenueTrend,
    visitEvents,
    purchaseEvents,
  ] = await Promise.all([
    getAffiliateChartData(affiliateCode, range),
    getOpenPanelChart({
      range,
      interval: "day",
      series: [
        {
          name: "purchase",
          segment: "event",
          filters: [affiliateFilter],
        },
      ],
    }),
    getAffiliateRevenue(affiliateCode, range),
    getAllOpenPanelEvents({
      event: "affiliate_visit",
      start,
      includes: ["properties", "device", "referrer", "referrerName", "country"],
      limit: 250,
      maxPages: 4,
    }),
    getAllOpenPanelEvents({
      event: "purchase",
      start,
      includes: ["properties", "device", "referrer", "referrerName", "country"],
      limit: 250,
      maxPages: 4,
    }),
  ]);

  const events = [...visitEvents, ...purchaseEvents]
    .filter((event) => getEventProperties(event).affiliate_code === affiliateCode)
    .sort((a, b) => {
      const aTime = new Date(
        String(a.timestamp ?? a.createdAt ?? a.created_at ?? a.time ?? 0),
      ).getTime();
      const bTime = new Date(
        String(b.timestamp ?? b.createdAt ?? b.created_at ?? b.time ?? 0),
      ).getTime();

      return bTime - aTime;
    });

  const trendMap = new Map<string, AffiliateTelemetryTrendPoint>();
  const mergeTrend = (
    chart: OpenPanelChartResult | null,
    key: "visits" | "purchases" | "revenue",
    field: "count" | "value",
  ) => {
    const series = chart?.series[0];
    if (!series) return;

    for (const point of series.data) {
      const entry = trendMap.get(point.date) ?? {
        date: point.date,
        visits: 0,
        purchases: 0,
        revenue: 0,
        conversionRate: null,
      };
      entry[key] = point[field];
      trendMap.set(point.date, entry);
    }
  };

  mergeTrend(visitTrend, "visits", "count");
  mergeTrend(purchaseTrend, "purchases", "count");
  mergeTrend(revenueTrend, "revenue", "value");

  const devices = new Map<string, number>();
  const countries = new Map<string, number>();
  const referrers = new Map<string, number>();
  const sources = new Map<string, number>();
  const utmSources = new Map<string, number>();
  const utmMediums = new Map<string, number>();
  const utmCampaigns = new Map<string, number>();
  const landingPaths = new Map<string, number>();

  for (const event of events) {
    const properties = getEventProperties(event);
    const device =
      typeof event.device === "string" && event.device.trim()
        ? event.device.trim()
        : getStringProperty(properties, "device", "deviceType") ||
          "Unknown device";
    const country =
      typeof event.country === "string" && event.country.trim()
        ? event.country.trim()
        : getStringProperty(properties, "country", "country_name") ||
          "Unknown country";
    const referrer =
      typeof event.referrerName === "string" && event.referrerName.trim()
        ? event.referrerName.trim()
        : normalizeReferrerLabel(
            typeof event.referrer === "string" ? event.referrer : null,
          );
    const utmSource = getStringProperty(properties, "utm_source");
    const utmMedium = getStringProperty(properties, "utm_medium");
    const utmCampaign = getStringProperty(properties, "utm_campaign");
    const source =
      getStringProperty(properties, "source", "channel", "referral_source") ||
      utmSource ||
      referrer;
    const landingPath = normalizePathLabel(
      getStringProperty(
        properties,
        "referral_path",
        "path",
        "pathname",
        "url",
        "page",
      ),
    );

    devices.set(device, (devices.get(device) ?? 0) + 1);
    countries.set(country, (countries.get(country) ?? 0) + 1);
    referrers.set(referrer, (referrers.get(referrer) ?? 0) + 1);
    sources.set(source, (sources.get(source) ?? 0) + 1);
    landingPaths.set(landingPath, (landingPaths.get(landingPath) ?? 0) + 1);

    if (utmSource) {
      utmSources.set(utmSource, (utmSources.get(utmSource) ?? 0) + 1);
    }

    if (utmMedium) {
      utmMediums.set(utmMedium, (utmMediums.get(utmMedium) ?? 0) + 1);
    }

    if (utmCampaign) {
      utmCampaigns.set(utmCampaign, (utmCampaigns.get(utmCampaign) ?? 0) + 1);
    }
  }

  return {
    trend: Array.from(trendMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        ...entry,
        conversionRate:
          entry.visits > 0 ? entry.purchases / entry.visits : null,
      })),
    events,
    devices: sortNamedValues(devices),
    countries: sortNamedValues(countries),
    referrers: sortNamedValues(referrers),
    sources: sortNamedValues(sources),
    utmSources: sortNamedValues(utmSources),
    utmMediums: sortNamedValues(utmMediums),
    utmCampaigns: sortNamedValues(utmCampaigns),
    landingPaths: sortNamedValues(landingPaths),
  } satisfies AffiliateOpenPanelTelemetry;
}

export async function getSiteMetrics(
  range = "30d",
  filters: OpenPanelFilter[] = [],
) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/metrics`);
  url.searchParams.set("range", range);
  withJsonParam(url, "filters", filters);

  const data = await fetchOpenPanel(url.toString(), "site metrics insight");
  const metrics = data?.metrics ?? data;
  if (!metrics) return null;

  return {
    visitors: toNumberOrNull(
      metrics.unique_visitors ?? metrics.visitors ?? metrics.current_visitors,
    ),
    sessions: toNumberOrNull(metrics.total_sessions ?? metrics.sessions),
    pageViews: toNumberOrNull(
      metrics.total_screen_views ?? metrics.pageviews ?? metrics.page_views,
    ),
    bounceRate: toNumberOrNull(metrics.bounce_rate),
    avgSessionDuration: toNumberOrNull(metrics.avg_session_duration),
    viewsPerSession: toNumberOrNull(metrics.views_per_session),
    series: normalizeSiteMetricSeries(data),
  } satisfies OpenPanelSiteMetrics;
}

export async function getTopPages(range = "30d", limit = 20) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/pages`);
  url.searchParams.set("range", range);
  url.searchParams.set("limit", String(limit));

  return (await fetchOpenPanel(url.toString(), "top pages insight")) ?? [];
}

export async function getReferrerData(range = "30d", limit = 20) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/referrer`);
  url.searchParams.set("range", range);
  url.searchParams.set("limit", String(limit));

  return (await fetchOpenPanel(url.toString(), "referrer insight")) ?? [];
}

export async function getInsightBreakdown(
  kind:
    | "country"
    | "device"
    | "source"
    | "utm_source"
    | "utm_medium"
    | "utm_campaign",
  range = "30d",
  limit = 10,
  filters: OpenPanelFilter[] = [],
) {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return [];

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/${kind}`);
  url.searchParams.set("range", range);
  url.searchParams.set("limit", String(limit));
  withJsonParam(url, "filters", filters);

  const data = await fetchOpenPanel(url.toString(), `${kind} insight`);
  return normalizeInsightNamedValues(data);
}

export async function getLiveVisitors() {
  const openPanelProjectId = projectId();
  if (!openPanelProjectId) return null;

  const url = new URL(`${INSIGHTS_BASE}/${openPanelProjectId}/live`);
  const data = await fetchOpenPanel(url.toString(), "live insight");

  return toNumberOrNull(
    data?.current_visitors ?? data?.visitors ?? data?.count,
  );
}

export async function getAdminAffiliateTelemetry(
  range = "30d",
  limit = 8,
): Promise<AdminAffiliateTelemetry | null> {
  const affiliateFilter: OpenPanelFilter = {
    name: "properties.affiliate_code",
    operator: "isNotNull",
    value: [],
  };

  const start = rangeToStartTimestamp(range) ?? undefined;
  const [
    visitTrend,
    purchaseTrend,
    revenueTrend,
    visitBreakdown,
    purchaseBreakdown,
    revenueBreakdown,
    visitEvents,
  ] = await Promise.all([
    getOpenPanelChart({
      range,
      interval: "day",
      series: [{ name: "affiliate_visit", segment: "event" }],
    }),
    getOpenPanelChart({
      range,
      interval: "day",
      series: [
        {
          name: "purchase",
          segment: "event",
          filters: [affiliateFilter],
        },
      ],
    }),
    getOpenPanelChart({
      range,
      interval: "day",
      series: [
        {
          name: "purchase",
          segment: "property_sum",
          property: "properties.orderTotal",
          filters: [affiliateFilter],
        },
      ],
    }),
    getOpenPanelChart({
      range,
      interval: "day",
      breakdowns: [{ name: "properties.affiliate_code" }],
      series: [{ name: "affiliate_visit", segment: "event" }],
    }),
    getOpenPanelChart({
      range,
      interval: "day",
      breakdowns: [{ name: "properties.affiliate_code" }],
      series: [
        {
          name: "purchase",
          segment: "event",
          filters: [affiliateFilter],
        },
      ],
    }),
    getOpenPanelChart({
      range,
      interval: "day",
      breakdowns: [{ name: "properties.affiliate_code" }],
      series: [
        {
          name: "purchase",
          segment: "property_sum",
          property: "properties.orderTotal",
          filters: [affiliateFilter],
        },
      ],
    }),
    getAllOpenPanelEvents({
      event: "affiliate_visit",
      start,
      includes: ["device", "referrer", "referrerName", "country", "properties"],
      limit: 250,
      maxPages: 4,
    }),
  ]);

  if (
    !visitTrend &&
    !purchaseTrend &&
    !revenueTrend &&
    !visitBreakdown &&
    !purchaseBreakdown &&
    !revenueBreakdown &&
    visitEvents.length === 0
  ) {
    return null;
  }

  const trendMap = new Map<string, AdminAffiliateTrendPoint>();
  const mergeTrend = (
    chart: OpenPanelChartResult | null,
    key: "visits" | "purchases" | "revenue",
    field: "count" | "value",
  ) => {
    const series = chart?.series[0];
    if (!series) return;

    for (const point of series.data) {
      const entry = trendMap.get(point.date) ?? {
        date: point.date,
        visits: 0,
        purchases: 0,
        revenue: 0,
      };
      entry[key] = point[field];
      trendMap.set(point.date, entry);
    }
  };

  mergeTrend(visitTrend, "visits", "count");
  mergeTrend(purchaseTrend, "purchases", "count");
  mergeTrend(revenueTrend, "revenue", "value");

  const leaderboardMap = new Map<
    string,
    Pick<
      AdminAffiliateLeaderboardEntry,
      "affiliateCode" | "visits" | "purchases" | "revenue"
    >
  >();
  const mergeLeaderboard = (
    chart: OpenPanelChartResult | null,
    key: "visits" | "purchases" | "revenue",
  ) => {
    for (const series of chart?.series ?? []) {
      const affiliateCode = series.breakdown?.trim();
      if (!affiliateCode) continue;

      const entry = leaderboardMap.get(affiliateCode) ?? {
        affiliateCode,
        visits: 0,
        purchases: 0,
        revenue: 0,
      };
      entry[key] = series.metricSum;
      leaderboardMap.set(affiliateCode, entry);
    }
  };

  mergeLeaderboard(visitBreakdown, "visits");
  mergeLeaderboard(purchaseBreakdown, "purchases");
  mergeLeaderboard(revenueBreakdown, "revenue");

  const devices = new Map<string, number>();
  const referrers = new Map<string, number>();
  const countries = new Map<string, number>();

  for (const event of visitEvents) {
    const device = typeof event.device === "string" ? event.device.trim() : "";
    const referrer =
      typeof event.referrerName === "string"
        ? event.referrerName.trim()
        : typeof event.referrer === "string"
          ? normalizeReferrerLabel(event.referrer)
          : "";
    const country =
      typeof event.country === "string" ? event.country.trim() : "";

    devices.set(
      device || "Unknown device",
      (devices.get(device || "Unknown device") ?? 0) + 1,
    );
    referrers.set(
      referrer || "Direct / unknown",
      (referrers.get(referrer || "Direct / unknown") ?? 0) + 1,
    );
    countries.set(
      country || "Unknown country",
      (countries.get(country || "Unknown country") ?? 0) + 1,
    );
  }

  return {
    trend: Array.from(trendMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    leaderboard: Array.from(leaderboardMap.values())
      .map((entry) => ({
        ...entry,
        conversionRate:
          entry.visits > 0 ? entry.purchases / entry.visits : null,
        avgOrderValue:
          entry.purchases > 0 ? entry.revenue / entry.purchases : null,
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.purchases - a.purchases ||
          b.visits - a.visits,
      )
      .slice(0, limit),
    devices: sortNamedValues(devices),
    referrers: sortNamedValues(referrers),
    countries: sortNamedValues(countries),
  } satisfies AdminAffiliateTelemetry;
}
