/**
 * The daily demo pulse — the pure part: what a day adds (by weekday), when
 * (Lagos times, never ahead of now for things that already happened), the
 * once-a-day marker, and the switch. No database here; lib/demo/pulse.ts
 * writes it.
 */
import { lagosDayKey } from '../utils/format-date';

/** demo_records model name of the once-a-day marker (one row per organisation per Lagos day). */
export const PULSE_MODEL = 'DemoPulse';
/** demo_records model names that remember which records the pulse made (so later days can move them on). */
export const PULSE_JOB = 'PulseJobCard';
export const PULSE_SERVICE = 'PulseService';
export const PULSE_VISIT = 'PulseVisit';
export const PULSE_TICKET = 'PulseTicket';
/** A pulse job card or service nobody moved on for this many days is closed off (the customer did not come back). */
export const PULSE_AGE_OUT_DAYS = 7;

export const pulseDayId = (organisationId: string, dayKey: string) => `${organisationId}:${dayKey}`;

/** On unless DEMO_DAILY_ACTIVITY=off. */
export const pulseEnabled = (env: Record<string, string | undefined> = process.env) => (env.DEMO_DAILY_ACTIVITY ?? '').trim().toLowerCase() !== 'off';

/** A Lagos clock time (UTC+1, no daylight saving) on a Lagos day 'YYYY-MM-DD'. */
export function lagosAt(dayKey: string, hh: number, mm = 0): Date {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hh - 1, mm));
}
/** The Lagos weekday of a day key (0 Sunday … 6 Saturday). */
export const weekdayOf = (dayKey: string) => lagosAt(dayKey, 12).getUTCDay();
/** The next working day (Mon–Fri) after a Lagos day. */
export function nextWorkingDay(dayKey: string): string {
  let t = lagosAt(dayKey, 12).getTime();
  do t += 86_400_000; while ([0, 6].includes(new Date(t).getUTCDay()));
  return lagosDayKey(new Date(t));
}

export type PulseDay = { dayKey: string; weekday: number; jobCards: number; servicesToday: number; servicesBooked: number; visitors: number; tickets: number; meeting: boolean; broadcast: boolean };

/** What one Lagos day adds: a busy weekday, a half-day Saturday, a quiet Sunday (a website message only). */
export function pulseDay(now: Date): PulseDay {
  const dayKey = lagosDayKey(now);
  const weekday = weekdayOf(dayKey);
  if (weekday === 0) return { dayKey, weekday, jobCards: 0, servicesToday: 0, servicesBooked: 0, visitors: 0, tickets: 1, meeting: false, broadcast: false };
  if (weekday === 6) return { dayKey, weekday, jobCards: 1, servicesToday: 0, servicesBooked: 1, visitors: 1, tickets: 1, meeting: false, broadcast: false };
  return { dayKey, weekday, jobCards: 3, servicesToday: 1, servicesBooked: 1, visitors: 2, tickets: 2, meeting: true, broadcast: weekday === 1 };
}

/**
 * Times for things that already happened today: spread through the morning
 * from 07:35, but never after `now` (a pulse that runs at 06:00 dates them
 * just before it). `i` of `n`, oldest first.
 */
export function happenedAt(dayKey: string, now: Date, i: number, n: number): Date {
  const start = lagosAt(dayKey, 7, 35).getTime();
  const end = Math.min(lagosAt(dayKey, 11, 30).getTime(), now.getTime() - 5 * 60_000);
  if (end <= start) return new Date(now.getTime() - (n - i) * 7 * 60_000);
  return new Date(start + Math.round(((i + 1) / (n + 1)) * (end - start)));
}

/** A seeded choice that is the same all day (so a retry picks the same things). */
export function dayRandom(dayKey: string, salt: string): () => number {
  let a = 0;
  for (const ch of `${dayKey}:${salt}`) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PULSE_VISITORS = [
  { name: 'Mr Okonkwo (fleet owner)', purpose: 'Bringing a vehicle for service', company: 'Fleet owner', hh: 10, mm: 0, minutes: 60, vehicle: 'TRUCK' },
  { name: 'Mrs Adeyemi (insurance assessor)', purpose: 'Insurance assessor inspection', company: 'Leadway Assurance (demo)', hh: 14, mm: 0, minutes: 60, vehicle: 'CAR' },
  { name: 'Mr Bello (Lagos Lubricants)', purpose: 'Supplier delivery follow-up', company: 'Lagos Lubricants Distribution', hh: 11, mm: 30, minutes: 45, vehicle: 'CAR' },
  { name: 'Ms Nwosu', purpose: 'Estimate discussion with the supervisor', company: '', hh: 9, mm: 30, minutes: 30, vehicle: 'ON_FOOT' },
] as const;

export const PULSE_TICKETS = [
  { subject: 'When will my vehicle be ready?', summary: 'The vehicle came in this morning. When can I collect it?', priority: 'NORMAL' },
  { subject: 'Please send the estimate again', summary: 'I did not receive the estimate for the repair. Please send it again.', priority: 'NORMAL' },
  { subject: 'Book a service for next week', summary: 'The reminder says my vehicle is due for its service. Please book me in next week.', priority: 'LOW' },
  { subject: 'Thank you for the quick repair', summary: 'Thank you to the team for the quick turnaround on my vehicle.', priority: 'LOW' },
  { subject: 'Question about my invoice', summary: 'The invoice shows labour twice. Please check it.', priority: 'HIGH' },
  { subject: 'Is the workshop open on Saturday?', summary: 'Can I bring the truck on Saturday morning?', priority: 'LOW' },
] as const;

export const PULSE_AI_ACK = 'Thank you for your message. A colleague in customer care will reply within the working day; your reference is on this message.';
export const PULSE_AGENT_REPLY = 'Thank you for waiting. We have checked with the workshop and updated your request; please let us know if anything else is needed.';
