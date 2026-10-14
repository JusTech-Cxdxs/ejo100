/**
 * Small pure helpers for the Enyo panel: the daily greeting, starter
 * questions by role, and the person's first name. No browser or server APIs,
 * so they are unit-tested directly.
 */

/** The hour (0–23) in Lagos for a moment. */
export function lagosHour(at: Date): number {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hourCycle: 'h23' }).format(at));
  return Number.isFinite(h) ? h % 24 : at.getUTCHours();
}

/** The Lagos calendar day as YYYY-MM-DD (the greeting is shown once per day). */
export function lagosDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.length > 24 ? first.slice(0, 24) : first;
}

function partOfDay(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * "Good morning, Ada. 3 approvals are waiting." — `approvals` null means the
 * count is not known (then the greeting says nothing about approvals).
 */
export function greetingText(opts: { name: string; hour: number; approvals: number | null }): string {
  const hello = opts.name ? `${partOfDay(opts.hour)}, ${opts.name}.` : `${partOfDay(opts.hour)}.`;
  if (opts.approvals === null) return `${hello} Ask me anything about your work.`;
  if (opts.approvals === 0) return `${hello} Nothing is waiting for your approval.`;
  if (opts.approvals === 1) return `${hello} 1 approval is waiting.`;
  return `${hello} ${opts.approvals} approvals are waiting.`;
}

/** Up to four starter questions that suit the person's role. */
export function starterPrompts(roleName: string): string[] {
  const r = roleName.toLowerCase();
  const out = ["What's waiting for me?"];
  const workshop = /workshop|front ?desk|reception|supervisor|technician|service|department head|branch/.test(r);
  const money = /finance|account|cashier|manager|admin|director|owner/.test(r);
  const store = /store|inventory|parts|procure/.test(r);
  if (workshop || /admin/.test(r)) out.push('How do I open a Job Card?');
  if (money) out.push("Today's takings");
  if (store || workshop || /admin/.test(r)) out.push('Price of an oil filter');
  if (out.length < 3) out.push('What can you help me with?');
  if (out.length < 4 && !out.includes('How do I open a Job Card?')) out.push('How do I open a Job Card?');
  return out.slice(0, 4);
}
