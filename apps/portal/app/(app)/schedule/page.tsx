import { guardAnyPage } from '@/lib/authz/server';
import { getSchedulingOverview } from '@/lib/actions/scheduling';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { RoomGrid } from '@/components/RoomGrid';
import { pluralize } from '@/lib/utils/pluralize';
import { dayKind, lagosYmd } from '@/lib/nigeria-calendar';
import { PageHeader, HeaderAction, SectionCard, StatTile, PriorityActions, BarRow, EmptyState, type IconName } from '@/components/ui';

const t = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', hourCycle: 'h12', minute: '2-digit' });
const dd = (d: Date) => new Date(d).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

export default async function SchedulingDashboard() {
  // Calendars are for people who keep one (an appointment itself stays open to the people in it).
  await guardAnyPage(['schedule.view', 'schedule.manage'], '/schedule');
  const o = await getSchedulingOverview();
  if (!o.access.canUse) {
    return (
      <div className="w-full p-4 sm:p-8">
        <PageHeader hero icon="calendar" eyebrow="Module" title="Scheduling" description={<>You do not have a calendar yet. An administrator can give you the <span className="font-medium">Calendar User</span> role (your own calendar), or an official can add you as their <span className="font-medium">aide</span>.</>} />
      </div>
    );
  }
  const g = o.glance, s = o.stats;
  const today = dayKind(lagosYmd(new Date()));
  const maxRoom = Math.max(1, ...s.busiestRooms.map((r) => r.hours));
  const maxHost = Math.max(1, ...s.busiestHosts.map((h) => h.total));
  const maxDay = Math.max(1, ...s.weekday.map((w) => w.count));
  const Kpi = ({ label, value, hint, href, icon = 'calendar' }: { label: string; value: string | number; hint?: string; href?: string; icon?: IconName }) => (
    <StatTile icon={icon} label={label} value={value} hint={hint} href={href} />
  );
  const Bar = ({ label, value, max, note }: { label: string; value: number; max: number; note: string }) => <BarRow label={label} value={value} max={max} note={note} labelWidth="8rem" />;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="calendar"
        eyebrow="Module"
        title="Scheduling"
        description={today.holiday ? `Today is a public holiday — ${today.holiday.name}.` : today.weekend ? 'Today is a weekend.' : 'Today is a working day (8 am – 5 pm).'}
        actions={<HeaderAction href="/schedule/new">+ New appointment</HeaderAction>}
      />
      <ScheduleNav active="/schedule" />

      <PriorityActions actions={o.actions} note={null} />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Today" value={g.today} hint={pluralize(g.today, 'appointment')} href="/schedule/appointments?show=today" />
        <Kpi icon="activity" label="In progress now" value={g.inProgress.length} />
        <Kpi icon="grid" label="This week" value={g.thisWeek} href="/schedule/calendar" />
        <Kpi icon="arrow-right" label="Next 7 days" value={g.next7Days} href="/schedule/appointments?show=upcoming" />
        <Kpi icon="badge" label="Visitors today" value={g.visitorsToday} hint="From appointments — Security has them" href="/security" />
        <Kpi icon="room" label="Rooms free right now" value={o.grid.freeRoomsNow ?? '—'} href="/schedule/availability" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <SectionCard icon="clock" title="Coming up">
          {g.next.length === 0 ? <EmptyState compact icon="calendar" title="Nothing booked." /> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {g.next.map((a) => (
                <li key={a.id}>
                  <LoadingLink href={`/schedule/${a.id}`} className="block rounded-[var(--ejo-radius-md)] px-2 py-2 transition-colors hover:bg-[var(--ejo-bg)]">
                    <span className="text-sm font-medium text-[var(--ejo-text)]">{dd(a.startsAt)}, {t(a.startsAt)}</span>
                    <span className="ml-2 text-sm text-[var(--ejo-text)]">{a.title}</span>
                    <span className="block text-xs text-[var(--ejo-text-muted)]">{a.ownerName} · {a.roomName ?? a.location ?? '—'}{a.visitors ? ` · ${pluralize(a.visitors, 'visitor')}` : ''}</span>
                  </LoadingLink>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard icon="room" title="Rooms today" actions={<LoadingLink href="/schedule/availability" className="text-[var(--ejo-primary)] hover:underline">Other days →</LoadingLink>}>
          <RoomGrid grid={o.grid} />
        </SectionCard>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]">Last 90 days</h2>
      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon="list" label="Appointments" value={s.total} />
        <Kpi icon="check-circle" label="Completed" value={s.completed} hint={`${pct(s.completionRate)} of closed`} href="/schedule/appointments?show=completed" />
        <Kpi icon="user" label="No-shows" value={s.noShow} hint={`${pct(s.noShowRate)} of closed`} href="/schedule/appointments?show=no_show" />
        <Kpi icon="close" label="Cancelled" value={s.cancelled} hint={`${pct(s.cancellationRate)} of all`} href="/schedule/appointments?show=cancelled" />
        <Kpi icon="clock" label="Awaiting outcome" value={s.awaitingOutcome} href="/schedule/appointments?show=awaiting" />
        <Kpi icon="gauge" label="Average length" value={s.averageMinutes === null ? '—' : pluralize(s.averageMinutes, 'min', 'min')} hint="Completed meetings" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard as="h3" icon="room" title="Busiest rooms (hours booked)">
          {s.busiestRooms.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No rooms yet.</p> : <div className="space-y-1.5">{s.busiestRooms.map((r) => <Bar key={r.id} label={r.name} value={r.hours} max={maxRoom} note={`${r.hours} hr`} />)}</div>}
        </SectionCard>
        <SectionCard as="h3" icon="users" title="Busiest hosts">
          {s.busiestHosts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No meetings yet.</p> : <div className="space-y-1.5">{s.busiestHosts.map((h) => <Bar key={h.id} label={h.name} value={h.total} max={maxHost} note={pluralize(h.total, 'meeting')} />)}</div>}
        </SectionCard>
        <SectionCard as="h3" icon="bars" title="By day of the week">
          <div className="space-y-1.5">{s.weekday.map((w) => <Bar key={w.name} label={w.name} value={w.count} max={maxDay} note={String(w.count)} />)}</div>
        </SectionCard>
      </div>
    </div>
  );
}
