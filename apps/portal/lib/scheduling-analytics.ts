import { WORK_START_HOUR, WORK_END_HOUR, lagosYmd } from '@/lib/nigeria-calendar';

/**
 * Scheduling analytics — pure functions over plain rows, so every figure is
 * reproducible and tested. All dates are judged in Lagos time.
 */
export type SAppt = {
  id: string;
  number: string;
  title: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  startsAt: Date;
  endsAt: Date;
  roomId: string | null;
  roomName: string | null;
  location: string | null;
  ownerId: string;
  ownerName: string;
  visitors: number;
};
export type SRoom = { id: string; name: string; capacity: number | null; isActive: boolean };

const DAY = 86400000;
const minutes = (a: SAppt) => Math.max(0, Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000));
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function computeSchedulingAnalytics(input: { appts: SAppt[]; rooms: SRoom[]; now?: Date; gridDate?: string }) {
  const now = input.now ?? new Date();
  const today = lagosYmd(now);
  const live = input.appts.filter((a) => a.status !== 'CANCELLED');
  const dayOf = (a: SAppt) => lagosYmd(a.startsAt);

  // ── At a glance
  const todayAppts = live.filter((a) => dayOf(a) === today).sort((x, y) => +x.startsAt - +y.startsAt);
  const weekStart = (() => { const d = new Date(`${today}T12:00:00+01:00`); const dow = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - dow * DAY); })();
  const weekDays = new Set(Array.from({ length: 7 }, (_, i) => lagosYmd(new Date(weekStart.getTime() + i * DAY))));
  const upcoming = live.filter((a) => a.status === 'SCHEDULED' && +a.endsAt > +now).sort((x, y) => +x.startsAt - +y.startsAt);
  const next7 = upcoming.filter((a) => +a.startsAt <= +now + 7 * DAY);
  const glance = {
    today: todayAppts.length,
    thisWeek: live.filter((a) => weekDays.has(dayOf(a))).length,
    next7Days: next7.length,
    visitorsToday: todayAppts.reduce((n, a) => n + a.visitors, 0),
    next: upcoming.slice(0, 8),
    inProgress: live.filter((a) => a.status === 'SCHEDULED' && +a.startsAt <= +now && +a.endsAt > +now),
  };

  // ── Last 90 days (closed + scheduled within the window, by start)
  const since = +now - 90 * DAY;
  const win = input.appts.filter((a) => +a.startsAt >= since && +a.startsAt <= +now);
  const by = (s: SAppt['status']) => win.filter((a) => a.status === s).length;
  const closed = by('COMPLETED') + by('NO_SHOW');
  const heldMinutes = win.filter((a) => a.status === 'COMPLETED').map(minutes);
  const roomHours = new Map<string, number>();
  win.filter((a) => a.roomId && a.status !== 'CANCELLED').forEach((a) => roomHours.set(a.roomId!, (roomHours.get(a.roomId!) ?? 0) + minutes(a) / 60));
  const hostCount = new Map<string, { name: string; total: number; noShow: number }>();
  win.filter((a) => a.status !== 'CANCELLED').forEach((a) => {
    const h = hostCount.get(a.ownerId) ?? { name: a.ownerName, total: 0, noShow: 0 };
    h.total += 1;
    if (a.status === 'NO_SHOW') h.noShow += 1;
    hostCount.set(a.ownerId, h);
  });
  const weekday = WEEKDAYS.map((name, i) => ({ name, count: win.filter((a) => a.status !== 'CANCELLED' && (new Date(new Date(a.startsAt).getTime() + 3600000).getUTCDay() + 6) % 7 === i).length }));
  const stats = {
    total: win.length,
    completed: by('COMPLETED'),
    noShow: by('NO_SHOW'),
    cancelled: by('CANCELLED'),
    awaitingOutcome: win.filter((a) => a.status === 'SCHEDULED' && +a.endsAt <= +now).length,
    completionRate: pct(by('COMPLETED'), closed),
    noShowRate: pct(by('NO_SHOW'), closed),
    cancellationRate: pct(by('CANCELLED'), win.length),
    averageMinutes: heldMinutes.length ? Math.round(heldMinutes.reduce((s, m) => s + m, 0) / heldMinutes.length) : null,
    busiestRooms: input.rooms.map((r) => ({ id: r.id, name: r.name, hours: Math.round((roomHours.get(r.id) ?? 0) * 10) / 10 })).sort((a, b) => b.hours - a.hours),
    busiestHosts: [...hostCount.entries()].map(([id, h]) => ({ id, ...h })).sort((a, b) => b.total - a.total).slice(0, 8),
    weekday,
  };

  // ── Room availability grid (working hours, hourly) for a date
  const gridDate = input.gridDate ?? today;
  const hours = Array.from({ length: WORK_END_HOUR - WORK_START_HOUR }, (_, i) => WORK_START_HOUR + i);
  const at = (h: number) => new Date(`${gridDate}T${String(h).padStart(2, '0')}:00:00+01:00`);
  const grid = input.rooms.filter((r) => r.isActive).map((r) => ({
    room: r,
    slots: hours.map((h) => {
      const s = at(h), e = at(h + 1);
      const hit = live.find((a) => a.roomId === r.id && a.status === 'SCHEDULED' && +a.startsAt < +e && +a.endsAt > +s) ?? live.find((a) => a.roomId === r.id && a.status !== 'SCHEDULED' && +a.startsAt < +e && +a.endsAt > +s);
      return { hour: h, busy: hit ? { id: hit.id, number: hit.number, title: hit.title } : null };
    }),
  }));
  const freeRoomsNow = gridDate === today ? input.rooms.filter((r) => r.isActive && !live.some((a) => a.roomId === r.id && a.status === 'SCHEDULED' && +a.startsAt <= +now && +a.endsAt > +now)).length : null;

  // ── What to do now
  type Action = { priority: 1 | 2 | 3; title: string; detail: string; href: string };
  const actions: Action[] = [];
  const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
  const pending = input.appts.filter((a) => a.status === 'SCHEDULED' && +a.endsAt <= +now);
  if (pending.length) actions.push({ priority: 1, title: `${plural(pending.length, 'meeting')} waiting for an outcome`, detail: 'Mark each as completed or a no-show so the records and statistics stay true.', href: '/schedule/appointments?show=awaiting' });
  const visitorsToday = todayAppts.filter((a) => a.visitors > 0 && a.status === 'SCHEDULED');
  if (visitorsToday.length) actions.push({ priority: 2, title: `${plural(visitorsToday.length, 'meeting')} with visitors today`, detail: 'Security has the bookings under Expected today.', href: '/security' });
  stats.busiestHosts.filter((h) => h.total >= 3 && h.noShow / h.total >= 0.3).forEach((h) => actions.push({ priority: 3, title: `${h.name}: frequent no-shows`, detail: `${plural(h.noShow, 'no-show')} out of ${plural(h.total, 'meeting')} in 90 days — confirm visitors a day before.`, href: '/schedule/appointments?show=no_show' }));
  stats.busiestRooms.filter((r) => r.hours === 0).forEach((r) => actions.push({ priority: 3, title: `${r.name} unused for 90 days`, detail: 'Consider closing it or using it for other purposes.', href: '/schedule/rooms' }));
  actions.sort((a, b) => a.priority - b.priority);

  return { glance, stats, grid: { date: gridDate, hours, rows: grid, freeRoomsNow }, actions, generatedAt: now };
}

export type SchedulingAnalytics = ReturnType<typeof computeSchedulingAnalytics>;
