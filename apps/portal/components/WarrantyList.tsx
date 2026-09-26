import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { warrantyCoverage, WARRANTY_STATE_CLASS, WARRANTY_STATE_LABEL } from '@/lib/warranty-state';

type Row = {
  id: string;
  warrantyNumber: string;
  kind: string;
  status: string;
  subjectDescription: string;
  startsAt: Date;
  endsAt: Date;
  startReading: number | null;
  distanceLimit: number | null;
  statusReason: string | null;
  vehicle: { mileage: number | null } | null;
  policy: { name: string; isSample: boolean };
  provider: { name: string };
};

/**
 * The warranties linked to a vehicle, Job Card, Vehicle Service or Parts
 * Request — every number clickable, every one with its live coverage state
 * and plain-language reason, and a printable certificate. The same rows
 * everywhere, so a warranty looks and links identically wherever it shows.
 */
export function WarrantyList({ warranties, title = 'Warranties', emptyText }: { warranties: Row[]; title?: string; emptyText?: string }) {
  if (warranties.length === 0 && !emptyText) return null;
  return (
    <div id="warranties" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{title}</h2>
        <LoadingLink href="/warranty" className="text-xs text-[var(--ejo-primary)] hover:underline">
          Warranty register →
        </LoadingLink>
      </div>
      {warranties.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {warranties.map((w) => {
            const cov = warrantyCoverage(w, w.vehicle?.mileage ?? null);
            return (
              <div key={w.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--ejo-border)] pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--ejo-text)]">
                    <LoadingLink href={`/warranty/${w.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                      {w.warrantyNumber}
                    </LoadingLink>{' '}
                    · {w.kind === 'ASSET' ? 'Vehicle' : 'Part'} — {w.subjectDescription}
                  </p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">
                    {w.policy.name} · {w.provider.name}
                    {w.policy.isSample ? ' · Sample terms' : ''}
                  </p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{cov.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${WARRANTY_STATE_CLASS[cov.state]}`}>{WARRANTY_STATE_LABEL[cov.state]}</span>
                  <PrintMenu orgHref={`/print/warranty/${w.id}`} clientHref={`/print/warranty/${w.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
