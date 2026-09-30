import { getSchedulingOverview } from '@/lib/actions/scheduling';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { RoomGrid } from '@/components/RoomGrid';
import { pluralize } from '@/lib/utils/pluralize';
import { dayKind, lagosYmd } from '@/lib/nigeria-calendar';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const t = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
const dd = (d: Date) => new Date(d).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

export default async function SchedulingDashboard() {
  const o = await getSchedulingOverview();
  if (!o.access.canUse) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Scheduling</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--ejo-text-muted)]">You do not have a calendar yet. An administrator can give you the <span className="font-medium">Calendar User</span> role (your own calendar), or an official can add you as their <span className="font-medium">aide</span>.</p>
      </div>
    );
  }
  const g = o.glance, s = o.stats;
  const today = dayKind(lagosYmd(new Date()));
  const maxRoom = Math.max(1, ...s.busiestRooms.map((r) => r.hours));
  const maxHost = Math.max(1, ...s.busiestHosts.map((h) => h.total));
  const maxDay = Math.max(1, ...s.weekday.map((w) => w.count));
  const Kpi = ({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) => {
    const inner = (<><p className="text-xs text-[var(--ejo-text-muted)]">{label}</p><p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{value}</p>{hint ? <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{hint}</p> : null}</>);
    return href ? <LoadingLink href={href} className={`${card} block hover:border-[var(--ejo-primary)]`}>{inner}</LoadingLink> : <div className={card}>{inner}</div>;
  };
  const Bar = ({ label, value, max, note }: { label: string; value: number; max: number; note: string }) => (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-xs">
      <span className="truncate text-[var(--ejo-text)]" title={label}>{label}</span>
      <div className="h-3 rounded bg-[var(--ejo-bg)]"><div className="h-3 rounded bg-[var(--ejo-primary)]" style={{ width: `${(value / max) * 100}%` }} /></div>
      <span className="text-[var(--ejo-text-muted)]">{note}</span>
    </div>
  );
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Scheduling</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{today.holiday ? `Today is a public holiday — ${today.holiday.name}.` : today.weekend ? 'Today is a weekend.' : 'Today is a working day (8 am – 5 pm).'}</p>
        </div>
        <LoadingLink href="/schedule/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New appointment</LoadingLink>
      </div>
      <ScheduleNav active="/schedule" />

      {o.actions.length ? (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">What to do now</h2>
          {o.actions.map((a, i) => (
            <LoadingLink key={i} href={a.href} className={`flex items-start gap-3 ${card} hover:border-[var(--ejo-primary)]`}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${a.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : a.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>P{a.priority}</span>
              <span className="min-w-0"><span className="block text-sm font-medium text-[var(--ejo-text)]">{a.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{a.detail}</span></span>
            </LoadingLink>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Today" value={g.today} hint={pluralize(g.today, 'appointment')} href="/schedule/appointments?show=today" />
        <Kpi label="In progress now" value={g.inProgress.length} />
        <Kpi label="This week" value={g.thisWeek} href="/schedule/calendar" />
        <Kpi label="Next 7 days" value={g.next7Days} href="/schedule/appointments?show=upcoming" />
        <Kpi label="Visitors today" value={g.visitorsToday} hint="From appointments — Security has them" href="/security" />
        <Kpi label="Rooms free right now" value={o.grid.freeRoomsNow ?? '—'} href="/schedule/availability" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Coming up</h2>
          {g.next.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">Nothing booked.</p> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {g.next.map((a) => (
                <li key={a.id}>
                  <LoadingLink href={`/schedule/${a.id}`} className="block py-2 hover:bg-[var(--ejo-bg)]">
                    <span className="text-sm font-medium text-[var(--ejo-text)]">{dd(a.startsAt)}, {t(a.startsAt)}</span>
                    <span className="ml-2 text-sm text-[var(--ejo-text)]">{a.title}</span>
                    <span className="block text-xs text-[var(--ejo-text-muted)]">{a.ownerName} · {a.roomName ?? a.location ?? '—'}{a.visitors ? ` · ${pluralize(a.visitors, 'visitor')}` : ''}</span>
                  </LoadingLink>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={card}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Rooms today</h2><LoadingLink href="/schedule/availability" className="text-xs text-[var(--ejo-primary)] hover:underline">Other days →</LoadingLink></div>
          <RoomGrid grid={o.grid} />
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Last 90 days</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Appointments" value={s.total} />
        <Kpi label="Completed" value={s.completed} hint={`${pct(s.completionRate)} of closed`} href="/schedule/appointments?show=completed" />
        <Kpi label="No-shows" value={s.noShow} hint={`${pct(s.noShowRate)} of closed`} href="/schedule/appointments?show=no_show" />
        <Kpi label="Cancelled" value={s.cancelled} hint={`${pct(s.cancellationRate)} of all`} href="/schedule/appointments?show=cancelled" />
        <Kpi label="Awaiting outcome" value={s.awaitingOutcome} href="/schedule/appointments?show=awaiting" />
        <Kpi label="Average length" value={s.averageMinutes === null ? '—' : pluralize(s.averageMinutes, 'min', 'min')} hint="Completed meetings" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Busiest rooms (hours booked)</h3>
          {s.busiestRooms.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No rooms yet.</p> : <div className="space-y-1.5">{s.busiestRooms.map((r) => <Bar key={r.id} label={r.name} value={r.hours} max={maxRoom} note={`${r.hours} hr`} />)}</div>}
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Busiest hosts</h3>
          {s.busiestHosts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No meetings yet.</p> : <div className="space-y-1.5">{s.busiestHosts.map((h) => <Bar key={h.id} label={h.name} value={h.total} max={maxHost} note={pluralize(h.total, 'meeting')} />)}</div>}
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">By day of the week</h3>
          <div className="space-y-1.5">{s.weekday.map((w) => <Bar key={w.name} label={w.name} value={w.count} max={maxDay} note={String(w.count)} />)}</div>
        </div>
      </div>
    </div>
  );
}
