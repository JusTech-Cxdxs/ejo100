import { listAppointments } from '@/lib/actions/scheduling';
import { LoadingLink } from '@/components/LoadingLink';
import { ScheduleNav } from '@/components/ScheduleNav';
import { SecurityTable } from '@/components/SecurityTable';
import { pluralize } from '@/lib/utils/pluralize';

const TABS: [string, string][] = [['upcoming', 'Upcoming'], ['today', 'Today'], ['awaiting', 'Awaiting outcome'], ['completed', 'Completed'], ['no_show', 'No-show'], ['cancelled', 'Cancelled'], ['all', 'All']];
const STATUS: Record<string, [string, string]> = {
  SCHEDULED: ['Scheduled', 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'],
  COMPLETED: ['Completed', 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'],
  CANCELLED: ['Cancelled', 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'],
  NO_SHOW: ['No-show', 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'],
};
const when = (a: Date, b: Date) => `${new Date(a).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(a).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })} – ${new Date(b).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })}`;

export default async function AppointmentsRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q, show } = await searchParams;
  const { tab, counts, rows } = await listAppointments(q, show);
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Appointments</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Every appointment on the calendars you can see — search by APT number, title, host, room, place, visitor or organisation.</p>
      <ScheduleNav active="/schedule/appointments" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => (
          <LoadingLink key={k} href={`/schedule/appointments?show=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({counts[k as keyof typeof counts]})</LoadingLink>
        ))}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="show" value={tab} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search APT, title, host, room, visitor…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-72" />
        </form>
      </div>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'appointment')}</p>
      <SecurityTable headers={['Number', 'When', 'Title', 'Host', 'Where', 'Visitors', 'Status']} widths={['13%', '22%', '20%', '13%', '13%', '10%', '9%']} empty={rows.length ? null : q ? 'Nothing matches.' : 'No appointments here.'}>
        {rows.map((a) => (
          <tr key={a.id}>
            <td><LoadingLink href={`/schedule/${a.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{a.appointmentNumber}</LoadingLink></td>
            <td className="text-xs">{when(a.startsAt, a.endsAt)}</td>
            <td>{a.title}</td>
            <td className="text-xs">{a.owner.fullName}{a.createdBy.fullName !== a.owner.fullName ? <span className="block text-[var(--ejo-text-muted)]">booked by {a.createdBy.fullName}</span> : null}</td>
            <td className="text-xs">{a.room?.name ?? a.location ?? '—'}</td>
            <td className="text-xs">{a.visits.length ? `${a.visits.reduce((n, v) => n + v.partySize, 0)}${a.visits.length > 1 ? ` in ${a.visits.length} groups` : a.visits[0]!.company ? ` · ${a.visits[0]!.company}` : ''}` : '—'}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[a.status]![1]}`}>{STATUS[a.status]![0]}</span></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
