import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { warrantyCoverage, WARRANTY_STATE_CLASS, WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

type Row = {
  id: string;
  warrantyNumber: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  startReading: number | null;
  distanceLimit: number | null;
  statusReason: string | null;
  quantity: unknown;
  customer: { fullName: string };
  vehicle: { id: string; make: string | null; model: string | null; plateNumber: string | null; mileage: number | null } | null;
  jobCard: { id: string; jobNumber: string } | null;
  vehicleService: { id: string; serviceNumber: string } | null;
  partSerial: { serialNumber: string } | null;
  slipLine: { slip: { id: string; referenceNumber: string } } | null;
  sourceReceipts: { id: string; referenceNumber: string }[];
  batchNumbers: string[];
};

/**
 * Every warranty issued for one part — its source (goods receipt, serial
 * or batch) and its destination (Parts Request → Job Card / Vehicle
 * Service → customer and vehicle), each number opening its exact record.
 */
export function PartWarrantyTraceTable({ rows }: { rows: Row[] }) {
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Warranties issued for this part ({rows.length})</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Where each warrantied unit came from, where it went, and whether it is still covered.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">None yet — a warranty number is issued automatically each time this part is released to a customer.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Warranty</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Issued via</th>
                <th className="px-3 py-2">Customer / vehicle</th>
                <th className="px-3 py-2">Valid until</th>
                <th className="px-3 py-2">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const cov = warrantyCoverage(w, w.vehicle?.mileage ?? null);
                return (
                  <tr key={w.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2">
                      <LoadingLink href={`/warranty/${w.id}`} className={`font-medium ${link}`}>{w.warrantyNumber}</LoadingLink>
                      <div className="mt-1"><PrintMenu orgHref={`/print/warranty/${w.id}`} clientHref={`/print/warranty/${w.id}?variant=client`} clientLabel="Customer Copy" size="compact" /></div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {w.partSerial ? <div>Serial {w.partSerial.serialNumber}</div> : null}
                      {w.batchNumbers.length ? <div>Batch {w.batchNumbers.join(', ')}</div> : null}
                      {!w.partSerial && !w.batchNumbers.length && w.quantity !== null ? <div>{pluralize(Number(w.quantity), 'unit')}</div> : null}
                      {w.sourceReceipts.map((g) => (
                        <LoadingLink key={g.id} href={`/inventory/goods-receipts/${g.id}`} className={`block ${link}`}>{g.referenceNumber}</LoadingLink>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {w.slipLine ? <LoadingLink href={`/workshop/parts-requests/${w.slipLine.slip.id}`} className={`block ${link}`}>{w.slipLine.slip.referenceNumber}</LoadingLink> : null}
                      {w.jobCard ? <LoadingLink href={`/workshop/job-cards/${w.jobCard.id}`} className={`block ${link}`}>{w.jobCard.jobNumber}</LoadingLink> : null}
                      {w.vehicleService ? <LoadingLink href={`/workshop/vehicle-service/${w.vehicleService.id}`} className={`block ${link}`}>{w.vehicleService.serviceNumber}</LoadingLink> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                      {w.customer.fullName}
                      {w.vehicle ? (
                        <LoadingLink href={`/workshop/vehicles/${w.vehicle.id}/edit`} className={`block ${link}`}>
                          {[w.vehicle.make, w.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}{w.vehicle.plateNumber ? ` — ${w.vehicle.plateNumber}` : ''}
                        </LoadingLink>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                      {formatDateOnly(w.endsAt)}
                      {w.startReading !== null && w.distanceLimit !== null ? <div>or {(w.startReading + w.distanceLimit).toLocaleString('en-NG')} km</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${WARRANTY_STATE_CLASS[cov.state]}`}>{WARRANTY_STATE_LABEL[cov.state]}</span>
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
