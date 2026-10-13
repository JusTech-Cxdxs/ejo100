/**
 * Every date and time on screen, in Lagos time (Africa/Lagos, UTC+1, no
 * daylight saving). The servers run in UTC, and Intl without a timeZone uses
 * the server's zone, which put every time an hour behind. Pages call these
 * helpers instead of toLocaleString so that can never happen in one spot.
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

/** Shorter form for table cells where space is tight. */
export function formatDateTimeCompact(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

/** Date only, where the time doesn't matter (e.g. a batch's Received At). */
export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

/** The calendar day in Lagos as YYYY-MM-DD (Africa/Lagos is UTC+1 all year). */
export function lagosDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** True when both moments fall on the same Lagos calendar day. */
export function isSameLagosDay(a: Date, b: Date): boolean {
  return lagosDayKey(a) === lagosDayKey(b);
}

/**
 * "just now", "1 minute ago", "5 minutes ago", "1 hour ago", "yesterday",
 * "3 days ago", then the date. Whole units, rounded down, so 59 minutes is
 * never shown as "1 hour" and 1 hour 59 minutes is "1 hour ago". A moment in
 * the future (a clock a little ahead) reads "just now". `short` gives the
 * compact form for tight spaces: "5 min ago", "3 h ago", "2 d ago".
 */
export function formatRelative(date: Date, now: Date = new Date(), opts: { short?: boolean } = {}): string {
  const seconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return opts.short ? `${minutes} min ago` : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return opts.short ? `${hours} h ago` : `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (opts.short) return days < 7 ? `${days} d ago` : formatDateShort(date);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDateShort(date);
}

/** "12 Oct 2026" in Lagos time. */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(date));
}

/** The current year in Lagos: reference numbers issued just after midnight on 1 January carry the new year. */
export function lagosYear(now: Date = new Date()): number {
  return Number(lagosDayKey(now).slice(0, 4));
}
