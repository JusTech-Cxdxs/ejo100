import { LoadingLink } from '@/components/LoadingLink';
import type { VehicleIntelligence } from '@/lib/vehicle-intelligence';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';

/** One vehicle's intelligence: what to do now, what's coming, and why. */
export function VehicleIntelligenceCard({ vi }: { vi: VehicleIntelligence }) {
  const d = vi.descriptive, g = vi.diagnostic, p = vi.predictive;
  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-sm font-semibold text-[var(--ejo-text)]">What to do now</h3>
        {vi.prescriptive.actions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Nothing needs attention for this vehicle.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vi.prescriptive.actions.map((a, i) => {
              const body = (
                <span className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${a.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : a.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>P{a.priority}</span>
                  <span className="min-w-0"><span className="block text-sm font-medium text-[var(--ejo-text)]">{a.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{a.detail}</span></span>
                </span>
              );
              return <li key={i}>{a.href ? <LoadingLink href={a.href} className="block hover:opacity-80">{body}</LoadingLink> : body}</li>;
            })}
          </ul>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <h3 className="text-sm font-semibold text-[var(--ejo-text)]">At a glance</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Visits</dt><dd>{d.visits}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Customer spend (approved)</dt><dd>{naira(d.customerSpend)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Covered (warranty / goodwill)</dt><dd className="text-[var(--ejo-success)]">{naira(d.coveredValue)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Outstanding</dt><dd className={d.outstanding > 0 ? 'text-[var(--ejo-error)]' : ''}>{naira(d.outstanding)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Km recorded</dt><dd>{d.kmRecorded === null ? '—' : `${d.kmRecorded.toLocaleString('en-NG')} km`}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Pace</dt><dd>{d.kmPerDay === null ? 'needs 2 readings' : `${d.kmPerDay.toLocaleString('en-NG')} km a day`}</dd></div>
          </dl>
        </div>
        <div className={card}>
          <h3 className="text-sm font-semibold text-[var(--ejo-text)]">Coming up</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Odometer today (est.)</dt><dd>{p.projectedKm === null ? '—' : `${p.projectedKm.toLocaleString('en-NG')} km`}</dd></div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--ejo-text-muted)]">Next service</dt>
              <dd>{p.serviceDue ? `${formatDateOnly(p.serviceDue.date)}${p.serviceDue.reason === 'km' ? ' (by km)' : ''}` : '—'}</dd>
            </div>
            {p.warrantyEnds.map((w) => (
              <div key={w.id} className="flex justify-between gap-2">
                <dt className="text-[var(--ejo-text-muted)]"><LoadingLink href={`/warranty/${w.id}`} className="text-[var(--ejo-primary)] hover:underline">{w.number}</LoadingLink> ends</dt>
                <dd>{formatDateOnly(w.date)}{w.reason === 'km' ? ' (by km)' : ''}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Km-based dates use this vehicle&apos;s own recorded pace.</p>
        </div>
        <div className={card}>
          <h3 className="text-sm font-semibold text-[var(--ejo-text)]">Patterns</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Average gap between visits</dt><dd>{g.avgDaysBetweenVisits === null ? '—' : pluralize(g.avgDaysBetweenVisits, 'day')}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Since last visit</dt><dd>{g.daysSinceLastVisit === null ? '—' : pluralize(g.daysSinceLastVisit, 'day')}</dd></div>
          </dl>
          <p className="mt-2 text-xs font-medium text-[var(--ejo-text)]">Repeat parts</p>
          {g.repeatParts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">None — no part fitted twice within a year.</p> : (
            <ul className="text-xs">
              {g.repeatParts.map((r) => (
                <li key={r.partId}><LoadingLink href={`/inventory/parts/${r.partId}`} className="text-[var(--ejo-primary)] hover:underline">{r.partName}</LoadingLink> — {pluralize(r.times, 'time')}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
