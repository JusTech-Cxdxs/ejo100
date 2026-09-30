import { getSchedulingOverview } from '@/lib/actions/scheduling';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { RoomGrid } from '@/components/RoomGrid';
import { dayKind } from '@/lib/nigeria-calendar';

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : today;
  const o = await getSchedulingOverview(day);
  const k = dayKind(day);
  const shift = (n: number) => { const d = new Date(`${day}T12:00:00+01:00`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const btn = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Room availability</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Which rooms are free or booked, hour by hour, across the working day — pick a free slot to avoid clashes.</p>
      <ScheduleNav active="/schedule/availability" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LoadingLink href={`/schedule/availability?date=${shift(-1)}`} className={btn}>← Previous day</LoadingLink>
        <LoadingLink href={`/schedule/availability?date=${today}`} className={btn}>Today</LoadingLink>
        <LoadingLink href={`/schedule/availability?date=${shift(1)}`} className={btn}>Next day →</LoadingLink>
        <form className="flex gap-2"><input name="date" type="date" defaultValue={day} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]" /><button type="submit" className={btn}>Show</button></form>
      </div>
      <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">
          {new Date(`${day}T12:00:00+01:00`).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {k.holiday ? <span className="ml-2 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-warning)]">Public holiday: {k.holiday.name}</span> : k.weekend ? <span className="ml-2 rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-text-muted)]">Weekend</span> : null}
        </p>
        <RoomGrid grid={o.grid} />
      </div>
    </div>
  );
}
