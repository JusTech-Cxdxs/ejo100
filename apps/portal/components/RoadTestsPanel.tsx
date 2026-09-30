import { LoadingLink } from '@/components/LoadingLink';
import { ROAD_TEST_STATUS_LABEL, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import type { listRoadTestsFor } from '@/lib/actions/security';

type Rows = Awaited<ReturnType<typeof listRoadTestsFor>>;

/** Road tests on this Job Card / Vehicle Service, and the button to request
 * one while the vehicle is in the workshop. */
export function RoadTestsPanel({ rows, requestHref }: { rows: Rows; requestHref: string | null }) {
  const open = rows.some((r) => ['PENDING_MANAGER', 'APPROVED', 'OUT'].includes(r.status));
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Road tests{rows.length ? ` (${rows.length})` : ''}</h2>
        {requestHref && !open ? (
          <LoadingLink href={requestHref} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Request road test</LoadingLink>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{requestHref ? 'None yet — request one when the vehicle is ready to be tested on the road.' : 'None.'}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--ejo-border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <LoadingLink href={`/security/road-tests/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.permitNumber}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">
                  {r.driver.fullName} · {r.purpose}
                  {r.gateOutAt ? ` · out ${formatDateTimeCompact(r.gateOutAt)}` : ''}
                  {r.startOdometer !== null && r.endOdometer !== null ? ` · ${(r.endOdometer - r.startOdometer).toLocaleString('en-NG')} km` : ''}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[r.status] ?? ''}`}>{ROAD_TEST_STATUS_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
