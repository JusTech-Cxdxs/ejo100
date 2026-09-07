/**
 * Consistent date+time formatting for every "created/registered/opened
 * by" line across Workshop — date alone was hiding *when* something
 * happened, not just who did it, which matters for an auditable
 * enterprise system.
 *
 * Always explicitly in West Africa Time (Africa/Lagos, UTC+1, no DST)
 * — the real fix for a genuine bug: this app runs server-side on
 * Vercel, whose own servers run in UTC, and `Intl.DateTimeFormat`
 * with no `timeZone` option silently uses that server's own ambient
 * timezone rather than the business's real one. Every timestamp in
 * the system was showing exactly one hour behind real Nigerian time
 * as a direct result — this is the one place that's fixed, and every
 * other date display in the project should route through here rather
 * than calling `toLocaleString`/`toLocaleDateString` directly, so a
 * timezone bug like this can never happen again in just one spot.
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
    hour12: true,
    timeZone: 'Africa/Lagos',
  }).format(date);
}

/** Date only, no time — for contexts where the exact time genuinely
 * doesn't matter (a batch's own "Received At" column, for instance). */
export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(date);
}
