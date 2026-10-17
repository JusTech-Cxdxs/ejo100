/**
 * The website's own visitor counting (pure, tested). Anonymous by design: no
 * cookie, no name, no stored internet address, no query string; a path segment that looks like
 * a token or id (a tracking link, a customer record) is replaced with ":id"
 * so nothing personal lands in the report.
 */
import { createHmac } from 'node:crypto';

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT.test(ua);
}

export function deviceOf(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' {
  const u = ua ?? '';
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(u)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(u)) return 'mobile';
  return 'desktop';
}

/** "/track/8f2c…?x=1#y" → "/track/:id". Null for API calls and anything that is not a path. */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const path = raw.split(/[?#]/)[0]!.slice(0, 300);
  // Never the customer portal (signed-in customers), APIs or framework files.
  if (/^\/(api|_next|customer-portal)(\/|$)/.test(path)) return null;
  const parts = path.split('/').map((seg) => {
    if (!seg) return seg;
    let s: string;
    try { s = decodeURIComponent(seg); } catch { return ':id'; }
    // Long or mixed letter+digit runs are ids or tokens; plain words and short numbers stay.
    if (s.length >= 16 || (/\d/.test(s) && /[a-z]/i.test(s) && s.length >= 8) || /^\d{5,}$/.test(s) || /@/.test(s)) return ':id';
    return s.toLowerCase().replace(/[^a-z0-9._~-]/g, '-').slice(0, 60);
  });
  const out = parts.join('/').replace(/\/+$/, '') || '/';
  return out.slice(0, 200);
}

/** The other site a visitor came from (host only), or null for this site and direct visits. */
export function referrerHost(ref: unknown, ownHost: string | null): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
    const own = (ownHost ?? '').toLowerCase().split(':')[0]!.replace(/^www\./, '');
    return h && h !== own ? h.slice(0, 100) : null;
  } catch { return null; }
}

/**
 * The visitor, without a cookie: a keyed hash of the internet address, the
 * browser and the Lagos day. It changes every day and cannot be turned back
 * into the address; nothing is stored on the visitor's device.
 */
export function visitorHash(ip: string, userAgent: string, day: Date, secret: string): string {
  return createHmac('sha256', secret).update(`site-visit:${day.toISOString().slice(0, 10)}:${ip}:${userAgent}`).digest('hex').slice(0, 32);
}

/** The hashing key: a dedicated one, else the site's secret; production never uses a built-in key. */
export function visitKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = env.SITE_VISIT_HASH_KEY || env.BETTER_AUTH_SECRET;
  if (k) return k;
  return env.NODE_ENV === 'production' ? null : 'site-visits-dev-only';
}

/** Seconds on a page as reported by the browser: whole, 0–30 minutes. */
export function cleanSeconds(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1800, Math.round(n))) : 0;
}

/** A Lagos calendar day as a UTC midnight Date (the @db.Date column). */
export function lagosDay(now = new Date()): Date {
  return new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00Z`);
}

/** Small fixed-window limiter per key (per server instance). */
export function makeLimiter(perMinute: number) {
  const hits = new Map<string, { at: number; n: number }>();
  return (key: string, now = Date.now()): boolean => {
    const h = hits.get(key);
    if (!h || now - h.at > 60_000) {
      if (hits.size > 5000) hits.clear();
      hits.set(key, { at: now, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= perMinute;
  };
}
