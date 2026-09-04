import { notFound } from 'next/navigation';
import { getPart } from '@/lib/actions/store';
import { getLastEditInfo } from '@/lib/actions/workshop';
import { createPartFitmentFormAction, updatePartFitmentFormAction, deletePartFitmentFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

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
export default async function PartDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string; editFitmentId?: string }>;
}) {
  const { id } = await params;
  const { error, status, editFitmentId } = await searchParams;
  const part = await getPart(id);
  if (!part) notFound();
  const lastEdit = await getLastEditInfo('Part', id, 'part.updated');

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
        <LoadingLink
          href={`/inventory/parts/${id}/edit`}
          className="ml-auto text-xs font-medium text-[var(--ejo-primary)] hover:underline"
        >
          Edit
        </LoadingLink>
      </div>
      {part.category ? <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">{part.category}</p> : null}

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Part updated." />
        </div>
      ) : null}
      {status === 'fitment_added' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Fitment added." />
        </div>
      ) : null}
      {status === 'fitment_removed' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Fitment removed." />
        </div>
      ) : null}
      {status === 'fitment_updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Fitment updated." />
        </div>
      ) : null}

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

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle Fitment</h2>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              {part.fitments.length === 0
                ? "No fitment recorded — this part is treated as fitting every vehicle, which is correct for universal parts like fluids. Add a fitment only if this part genuinely varies by vehicle."
                : 'Only fits the vehicle configurations listed below.'}
            </p>
            {part.fitments.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                      <th className="px-2 py-1.5">Make</th>
                      <th className="px-2 py-1.5">Model</th>
                      <th className="px-2 py-1.5">Engine</th>
                      <th className="px-2 py-1.5">Years</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {part.fitments.map((fitment: (typeof part.fitments)[number]) =>
                      editFitmentId === fitment.id ? (
                        <tr key={fitment.id} className="border-b border-[var(--ejo-border)] last:border-0">
                          <td colSpan={5} className="py-2">
                            <form action={updatePartFitmentFormAction} className="flex flex-wrap items-center gap-2">
                              <FormPendingOverlay />
                              <input type="hidden" name="partId" value={part.id} />
                              <input type="hidden" name="fitmentId" value={fitment.id} />
                              <input
                                name="make"
                                required
                                defaultValue={fitment.make}
                                placeholder="Make"
                                className="w-24 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                              />
                              <input
                                name="model"
                                required
                                defaultValue={fitment.model}
                                placeholder="Model"
                                className="w-24 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                              />
                              <input
                                name="engineType"
                                defaultValue={fitment.engineType ?? ''}
                                placeholder="Engine (optional)"
                                className="w-32 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                              />
                              <input
                                name="yearFrom"
                                type="number"
                                defaultValue={fitment.yearFrom ?? ''}
                                placeholder="Year from"
                                className="w-20 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                              />
                              <input
                                name="yearTo"
                                type="number"
                                defaultValue={fitment.yearTo ?? ''}
                                placeholder="Year to"
                                className="w-20 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                              />
                              <SubmitButton
                                label="Save"
                                pendingLabel="Saving…"
                                className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                              />
                              <LoadingLink
                                href={`/inventory/parts/${part.id}`}
                                className="text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
                              >
                                Cancel
                              </LoadingLink>
                            </form>
                          </td>
                        </tr>
                      ) : (
                        <tr key={fitment.id} className="border-b border-[var(--ejo-border)] last:border-0">
                          <td className="px-2 py-1.5 font-medium text-[var(--ejo-text)]">{fitment.make}</td>
                          <td className="px-2 py-1.5 text-[var(--ejo-text)]">{fitment.model}</td>
                          <td className="px-2 py-1.5 text-[var(--ejo-text-muted)]">{fitment.engineType ?? 'Any'}</td>
                          <td className="px-2 py-1.5 text-[var(--ejo-text-muted)]">
                            {fitment.yearFrom || fitment.yearTo ? `${fitment.yearFrom ?? '…'}–${fitment.yearTo ?? '…'}` : 'Any'}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <LoadingLink
                                href={`/inventory/parts/${part.id}?editFitmentId=${fitment.id}`}
                                className="text-xs text-[var(--ejo-primary)] hover:underline"
                              >
                                Edit
                              </LoadingLink>
                              <form action={deletePartFitmentFormAction} className="inline">
                                <input type="hidden" name="partId" value={part.id} />
                                <input type="hidden" name="fitmentId" value={fitment.id} />
                                <button type="submit" className="text-xs text-[var(--ejo-error)] hover:underline">
                                  Remove
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            <details className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">+ Add a vehicle fitment</summary>
              <form action={createPartFitmentFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="partId" value={part.id} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="make" required placeholder="Make, e.g. Isuzu" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                  <input name="model" required placeholder="Model, e.g. NPR" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
                <input name="engineType" placeholder="Engine (optional — leave blank to fit every engine of this make/model)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="yearFrom" type="number" placeholder="Year from (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                  <input name="yearTo" type="number" placeholder="Year to (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
                <SubmitButton
                  label="Add Fitment"
                  pendingLabel="Adding…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                />
              </form>
            </details>
          </div>
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
              {lastEdit ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Last Edited</dt>
                  <dd className="text-[var(--ejo-text)]">
                    {formatDateTimeCompact(lastEdit.at)}
                    <br />by {lastEdit.userName}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
