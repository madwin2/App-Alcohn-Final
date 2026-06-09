export type NormalizedAnalyticsRow = {
  id: string;
  createdAt: string;
  eventName: string;
  pagePath: string | null;
  pageUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  visitorId: string | null;
  sessionId: string | null;
  userAgent: string | null;
  ip: string | null;
};

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Normaliza filas de web_analytics_events (esquema web: event_name, page_url, …). */
export function normalizeAnalyticsRow(raw: Record<string, unknown>): NormalizedAnalyticsRow {
  return {
    id: String(raw.id ?? ''),
    createdAt: String(raw.created_at ?? ''),
    eventName: strOrNull(raw.event_name ?? raw.event_type) ?? 'unknown',
    pagePath: strOrNull(raw.page_path),
    pageUrl: strOrNull(raw.page_url),
    referrer: strOrNull(raw.referrer),
    utmSource: strOrNull(raw.utm_source),
    utmMedium: strOrNull(raw.utm_medium),
    utmCampaign: strOrNull(raw.utm_campaign),
    visitorId: strOrNull(raw.visitor_id ?? raw.anonymous_id ?? raw.client_id),
    sessionId: strOrNull(raw.session_id),
    userAgent: strOrNull(raw.user_agent),
    ip: strOrNull(raw.ip),
  };
}

export function analyticsVisitorKey(row: NormalizedAnalyticsRow): string | null {
  return row.visitorId ?? row.sessionId ?? (row.ip && row.userAgent ? `${row.ip}::${row.userAgent}` : row.ip);
}

export function isLocalhostAnalytics(row: NormalizedAnalyticsRow): boolean {
  const haystack = `${row.pageUrl ?? ''} ${row.pagePath ?? ''} ${row.referrer ?? ''}`.toLowerCase();
  return haystack.includes('localhost') || haystack.includes('127.0.0.1');
}

export function filterProductionAnalytics(rows: NormalizedAnalyticsRow[]): NormalizedAnalyticsRow[] {
  return rows.filter((r) => !isLocalhostAnalytics(r));
}

export function countUniqueVisitors(rows: NormalizedAnalyticsRow[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = analyticsVisitorKey(row);
    if (key) keys.add(key);
  }
  if (keys.size > 0) return keys.size;
  return rows.filter((r) => r.eventName === 'page_view').length;
}

export function countSessions(rows: NormalizedAnalyticsRow[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.sessionId) keys.add(row.sessionId);
  }
  if (keys.size > 0) return keys.size;
  return countUniqueVisitors(rows);
}
