/**
 * The website's own visitor counting (pure, tested). Anonymous by design: no
 * name, no internet address, no query string; a path segment that looks like
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
  if (/^\/(api|_next)(\/|$)/.test(path)) return null;
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

/** A one-way keyed hash of the random visitor cookie: counts distinct visitors without keeping the cookie. */
export function visitorHash(visitorKey: string, secret = process.env.SITE_VISIT_HASH_KEY || process.env.BETTER_AUTH_SECRET || 'site-visits-dev-only'): string {
  return createHmac('sha256', secret).update(`site-visit:${visitorKey}`).digest('hex').slice(0, 32);
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
