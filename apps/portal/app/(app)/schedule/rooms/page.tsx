import { listRooms, getSchedulingAccess } from '@/lib/actions/scheduling';
import { saveRoomFormAction, roomActiveFormAction } from '@/lib/actions/scheduling-form-handlers';
import { ScheduleNav } from '@/components/ScheduleNav';
import { SecurityTable } from '@/components/SecurityTable';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  const { status, error, edit } = await searchParams;
  const [rooms, access] = await Promise.all([listRooms(true), getSchedulingAccess()]);
  const editing = rooms.find((r) => r.id === edit) ?? null;
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Meeting rooms</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">A room can never be double-booked — the calendar refuses a clash.</p>
      <ScheduleNav active="/schedule/rooms" />
      {status === 'room_saved' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Room saved." /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SecurityTable headers={['Room', 'Where', 'Seats', 'Status', '']} widths={['28%', '28%', '12%', '14%', '18%']} empty={rooms.length ? null : 'No meeting rooms yet.'}>
          {rooms.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.name}</td>
              <td className="text-xs">{r.location ?? '—'}</td>
              <td className="text-xs">{r.capacity ?? '—'}</td>
              <td className="text-xs">{r.isActive ? 'Open' : 'Closed'}</td>
              <td>
                {access.isAdmin ? (
                  <span className="flex flex-wrap gap-2 text-xs">
                    <a href={`/schedule/rooms?edit=${r.id}`} className="text-[var(--ejo-primary)] hover:underline">Edit</a>
                    <form action={roomActiveFormAction}><FormPendingOverlay /><input type="hidden" name="roomId" value={r.id} /><input type="hidden" name="active" value={r.isActive ? 'no' : 'yes'} /><SubmitButton label={r.isActive ? 'Close' : 'Reopen'} pendingLabel="…" className="text-xs text-[var(--ejo-primary)] hover:underline" /></form>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </SecurityTable>
        {access.isAdmin ? (
          <form action={saveRoomFormAction} className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
            <FormPendingOverlay />
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{editing ? `Edit ${editing.name}` : 'Add a room'}</h2>
            {editing ? <input type="hidden" name="roomId" value={editing.id} /> : null}
            <div><label className={label}>Name</label><input name="name" required defaultValue={editing?.name ?? ''} placeholder="e.g. Boardroom" className={input} /></div>
            <div><label className={label}>Where (optional)</label><input name="location" defaultValue={editing?.location ?? ''} placeholder="e.g. Admin block, 1st floor" className={input} /></div>
            <div><label className={label}>Seats (optional)</label><input name="capacity" type="number" min={1} defaultValue={editing?.capacity ?? ''} className={input} /></div>
            <SubmitButton label={editing ? 'Save room' : 'Add room'} pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90" />
          </form>
        ) : null}
      </div>
    </div>
  );
}
