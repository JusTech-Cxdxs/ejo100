import { LoadingLink } from '@/components/LoadingLink';
import type { SchedulingAnalytics } from '@/lib/scheduling-analytics';

/** Rooms × working hours: free (green) or occupied (links to the meeting).
 * On a phone it scrolls within its own box — the page never does. */
export function RoomGrid({ grid }: { grid: SchedulingAnalytics['grid'] }) {
  if (grid.rows.length === 0) return <p className="text-sm text-[var(--ejo-text-muted)]">No meeting rooms set up yet.</p>;
  const h12 = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-32 text-left font-semibold text-[var(--ejo-text-muted)]">Room</th>
            {grid.hours.map((h) => <th key={h} className="font-medium text-[var(--ejo-text-muted)]">{h12(h)}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <tr key={r.room.id}>
              <td className="truncate pr-2 font-medium text-[var(--ejo-text)]" title={r.room.name}>{r.room.name}{r.room.capacity ? <span className="block text-[10px] font-normal text-[var(--ejo-text-muted)]">seats {r.room.capacity}</span> : null}</td>
              {r.slots.map((s) => (
                <td key={s.hour} className="h-9 p-0">
                  {s.busy ? (
                    <LoadingLink href={`/schedule/${s.busy.id}`} title={`${s.busy.number} — ${s.busy.title}`} className="flex h-full items-center justify-center rounded bg-[var(--ejo-primary)]/80 px-1 text-[10px] font-medium text-white hover:opacity-90">
                      <span className="truncate">{s.busy.title}</span>
                    </LoadingLink>
                  ) : (
                    <span className="block h-full rounded bg-[var(--ejo-success)]/15" title="Free" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Green = free · Blue = booked (tap to open)</p>
    </div>
  );
}
