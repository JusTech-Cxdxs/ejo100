import { LoadingLink } from '@/components/LoadingLink';
import { IssuedToLinks } from '@/components/IssuedToLinks';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralizeWord } from '@/lib/utils/pluralize';

type Row = {
  id: string;
  quantityReleased: unknown;
  part: { id: string; name: string; partNumber: string | null; baseUnitOfMeasure: string };
  issuedSerials: { serialNumber: string }[];
  warranties: { id: string; warrantyNumber: string }[];
  slip: {
    id: string;
    referenceNumber: string;
    releasedAt: Date | null;
    jobCard: { id: string; jobNumber: string; customer: { fullName: string } } | null;
    vehicleService: { id: string; serviceNumber: string; customer: { fullName: string } } | null;
  };
};

/** The vehicle's parts history — what was fitted, when, on which visit,
 * and under which warranty; every number opens its exact record. */
export function VehiclePartsFitted({ rows }: { rows: Row[] }) {
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Parts fitted ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No parts have been released to this vehicle yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Quantity / serials</th>
                <th className="px-3 py-2">Visit</th>
                <th className="px-3 py-2">Warranty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const qty = Number(r.quantityReleased ?? 0);
                return (
                  <tr key={r.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{r.slip.releasedAt ? formatDateOnly(r.slip.releasedAt) : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <LoadingLink href={`/inventory/parts/${r.part.id}`} className={link}>{r.part.name}</LoadingLink>
                      {r.part.partNumber ? <div className="text-[var(--ejo-text-muted)]">{r.part.partNumber}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {qty.toLocaleString('en-NG', { maximumFractionDigits: 3 })} {pluralizeWord(qty, r.part.baseUnitOfMeasure)}
                      {r.issuedSerials.length ? <div className="text-[var(--ejo-text-muted)]">{r.issuedSerials.map((x) => x.serialNumber).join(', ')}</div> : null}
                    </td>
                    <td className="px-3 py-2"><IssuedToLinks slip={r.slip} /></td>
                    <td className="px-3 py-2 text-xs">
                      {r.warranties.length === 0 ? <span className="text-[var(--ejo-text-muted)]">—</span> : r.warranties.map((w) => (
                        <LoadingLink key={w.id} href={`/warranty/${w.id}`} className={`block ${link}`}>{w.warrantyNumber}</LoadingLink>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
