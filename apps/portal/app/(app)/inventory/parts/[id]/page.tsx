import { notFound } from 'next/navigation';
import { getPart } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';

const TRACKING_TYPE_LABEL: Record<string, string> = {
  QUANTITY: 'Quantity',
  BATCH: 'Batch',
  SERIALIZED: 'Serialized',
};

function formatQty(value: unknown): string {
  return Number(value).toLocaleString('en-NG', { maximumFractionDigits: 3 });
}

/**
 * A single part's detail — stock on hand, and whichever tracking-type
 * detail actually applies: batches still holding stock for a BATCH part,
 * or the individual in-stock serials for a SERIALIZED one. A QUANTITY
 * part has neither — its PartStock total already is the whole story.
 */
export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const part = await getPart(id);
  if (!part) notFound();

  return (
    <div className="p-8">
      <LoadingLink
        href="/inventory/parts"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Parts Catalog
      </LoadingLink>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{part.name}</h1>
        <span className="rounded-full bg-[var(--ejo-info)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-info)]">
          {TRACKING_TYPE_LABEL[part.trackingType] ?? part.trackingType}
        </span>
      </div>
      {part.category ? <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">{part.category}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {part.trackingType === 'BATCH' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Batches In Stock</h2>
              {part.batches.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No batches with remaining stock.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                        <th className="px-3 py-2">Batch No.</th>
                        <th className="px-3 py-2">Received</th>
                        <th className="px-3 py-2">Remaining</th>
                        <th className="px-3 py-2">Received At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.batches.map((batch: (typeof part.batches)[number]) => (
                        <tr key={batch.id} className="border-b border-[var(--ejo-border)] last:border-0">
                          <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{batch.batchNumber}</td>
                          <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{formatQty(batch.receivedQuantity)} {part.baseUnitOfMeasure}</td>
                          <td className="px-3 py-2 text-[var(--ejo-text)]">{formatQty(batch.remainingQuantity)} {part.baseUnitOfMeasure}</td>
                          <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{new Date(batch.receivedAt).toLocaleDateString('en-NG')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {part.trackingType === 'SERIALIZED' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Units In Stock</h2>
              {part.serials.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No units currently in stock.</p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {part.serials.map((serial: (typeof part.serials)[number]) => (
                    <span
                      key={serial.id}
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]"
                    >
                      {serial.serialNumber}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {part.alternativeUnits.length > 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Alternative Units</h2>
              <ul className="mt-3 space-y-1 text-sm text-[var(--ejo-text)]">
                {part.alternativeUnits.map((unit: (typeof part.alternativeUnits)[number]) => (
                  <li key={unit.id}>
                    1 {unit.unitName} = {formatQty(unit.conversionFactor)} {part.baseUnitOfMeasure}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="h-fit space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <p className="text-xs text-[var(--ejo-text-muted)]">On Hand</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">
              {part.stock ? formatQty(part.stock.quantityOnHand) : '0'} <span className="text-sm font-normal text-[var(--ejo-text-muted)]">{part.baseUnitOfMeasure}</span>
            </p>
            {part.stock && Number(part.stock.quantityReserved) > 0 ? (
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{formatQty(part.stock.quantityReserved)} reserved</p>
            ) : null}
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Part Number</dt>
                <dd className="text-[var(--ejo-text)]">{part.partNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Base Unit</dt>
                <dd className="text-[var(--ejo-text)]">{part.baseUnitOfMeasure}</dd>
              </div>
              {part.reorderPoint ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Reorder Point</dt>
                  <dd className="text-[var(--ejo-text)]">{formatQty(part.reorderPoint)}</dd>
                </div>
              ) : null}
              {part.description ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Description</dt>
                  <dd className="text-[var(--ejo-text)]">{part.description}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Added By</dt>
                <dd className="text-[var(--ejo-text)]">{part.createdBy.fullName}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
