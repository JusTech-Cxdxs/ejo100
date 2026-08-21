/**
 * Consistent date+time formatting for every "created/registered/opened
 * by" line across Workshop — date alone was hiding *when* something
 * happened, not just who did it, which matters for an auditable
 * enterprise system.
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
  }).format(date);
}
