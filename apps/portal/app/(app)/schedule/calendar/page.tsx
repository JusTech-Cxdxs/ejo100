import { getSchedulingAccess, listCalendar } from '@/lib/actions/scheduling';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { pluralize } from '@/lib/utils/pluralize';
import { dayKind, WORK_START_HOUR, WORK_END_HOUR } from '@/lib/nigeria-calendar';

const STATUS: Record<string, [string, string]> = {
  SCHEDULED: ['Scheduled', 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'],
  COMPLETED: ['Completed', 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'],
  CANCELLED: ['Cancelled', 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'],
  NO_SHOW: ['No-show', 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'],
};
const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+01:00`);
const ymdOf = (d: Date) => new Date(d.getTime() + 3600000).toISOString().slice(0, 10);
const time = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; owner?: string }> }) {
  const { date, view, owner } = await searchParams;
  const access = await getSchedulingAccess();
  if (!access.canUse) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Scheduling</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
          You do not have a calendar yet. An administrator can give you the <span className="font-medium">Calendar User</span> role (your own calendar), or an official can add you as their <span className="font-medium">aide</span> so you can book for them.
        </p>
      </div>
    );
  }
  const isWeek = view !== 'day';
  const base = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : lagosToday();
  let start = dayStart(base);
  if (isWeek) {
    const dow = (new Date(`${base}T12:00:00+01:00`).getUTCDay() + 6) % 7; // Monday = 0
    start = new Date(start.getTime() - dow * 86400000);
  }
  const days = isWeek ? 7 : 1;
  const end = new Date(start.getTime() + days * 86400000);
  const rows = await listCalendar(start, end, owner || undefined);
  const shift = (n: number) => ymdOf(new Date(start.getTime() + n * days * 86400000));
  const q = (d: string) => `/schedule/calendar?date=${d}&view=${isWeek ? 'week' : 'day'}${owner ? `&owner=${owner}` : ''}`;
  const btn = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]';
  const dayList = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86400000));
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Calendar</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{pluralize(rows.filter((r) => r.status !== 'CANCELLED').length, 'appointment')} {isWeek ? 'in this week' : 'on this day'} · working days Monday–Friday, {WORK_START_HOUR} am – {WORK_END_HOUR - 12} pm.</p>
        </div>
        <LoadingLink href="/schedule/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New appointment</LoadingLink>
      </div>
      <ScheduleNav active="/schedule/calendar" />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <LoadingLink href={q(shift(-1))} className={btn}>← Previous</LoadingLink>
        <LoadingLink href={q(lagosToday())} className={btn}>Today</LoadingLink>
        <LoadingLink href={q(shift(1))} className={btn}>Next →</LoadingLink>
        <LoadingLink href={`/schedule/calendar?date=${base}&view=day${owner ? `&owner=${owner}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${!isWeek ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Day</LoadingLink>
        <LoadingLink href={`/schedule/calendar?date=${base}&view=week${owner ? `&owner=${owner}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${isWeek ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Week</LoadingLink>
        {access.owners.length > 1 ? (
          <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <input type="hidden" name="date" value={base} />
            <input type="hidden" name="view" value={isWeek ? 'week' : 'day'} />
            <select name="owner" defaultValue={owner ?? ''} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-auto">
              <option value="">All calendars I can see</option>
              {access.owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}{o.mine ? ' (mine)' : ''}</option>)}
            </select>
            <button type="submit" className={btn}>Show</button>
          </form>
        ) : null}
      </div>
      <div className="space-y-4">
        {dayList.map((d) => {
          const ymd = ymdOf(d);
          const items = rows.filter((r) => ymdOf(new Date(r.startsAt)) === ymd);
          const k = dayKind(ymd);
          return (
            <div key={ymd} className={`rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] ${k.working ? 'border-[var(--ejo-border)]' : 'border-dashed border-[var(--ejo-border)] opacity-90'}`}>
              <div className={`flex flex-wrap items-center gap-2 border-b border-[var(--ejo-border)] px-4 py-2 text-sm font-semibold ${!k.working ? 'bg-[var(--ejo-bg)]' : ''} ${ymd === lagosToday() ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)]'}`}>
                {d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' })}{ymd === lagosToday() ? ' — today' : ''}
                {k.holiday ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-warning)]">Public holiday: {k.holiday.name}{k.holiday.provisional ? ' (subject to FG declaration)' : ''}</span> : k.weekend ? <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-text-muted)]">Weekend</span> : <span className="rounded-full bg-[var(--ejo-success)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-success)]">Working day</span>}
                <span className="text-xs font-normal text-[var(--ejo-text-muted)]">{items.length ? pluralize(items.length, 'appointment') : 'free'}</span>
              </div>
              {items.length ? (
                <ul className="divide-y divide-[var(--ejo-border)]">
                  {items.map((a) => (
                    <li key={a.id}>
                      <LoadingLink href={`/schedule/${a.id}`} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 hover:bg-[var(--ejo-bg)]">
                        <span className="min-w-0">
                          <span className="text-sm font-semibold text-[var(--ejo-text)]">{time(a.startsAt)} – {time(a.endsAt)}</span>
                          {(() => { const h = (x: Date) => { const t = new Date(new Date(x).getTime() + 3600000); return t.getUTCHours() + t.getUTCMinutes() / 60; }; return h(a.startsAt) < WORK_START_HOUR || h(a.endsAt) > WORK_END_HOUR ? <span className="ml-2 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)]">Outside working hours</span> : null; })()}
                          <span className="ml-2 text-sm text-[var(--ejo-text)]">{a.title}</span>
                          <span className="block text-xs text-[var(--ejo-text-muted)]">
                            {a.owner.fullName} · {a.room?.name ?? a.location ?? '—'}
                            {a.participants.length ? ` · ${pluralize(a.participants.length, 'colleague')}` : ''}
                            {a.visits.length ? ` · ${pluralize(a.visits.reduce((n, v) => n + v.partySize, 0), 'visitor')}${a.visits.length > 1 ? ` (${a.visits.length} groups)` : a.visits[0]!.company ? ` from ${a.visits[0]!.company}` : ''}` : ''}
                          </span>
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[a.status]![1]}`}>{STATUS[a.status]![0]}</span>
                      </LoadingLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
