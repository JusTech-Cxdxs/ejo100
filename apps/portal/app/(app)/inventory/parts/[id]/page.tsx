import { notFound } from 'next/navigation';
import { getPart, getPartAuditTrail } from '@/lib/actions/store';
import { getLastEditInfo } from '@/lib/actions/workshop';
import { createPartFitmentFormAction, updatePartFitmentFormAction, deletePartFitmentFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SellingPriceCalculator } from '@/components/SellingPriceCalculator';
import { TargetMarginEditor } from '@/components/TargetMarginEditor';
import { pluralizeWord } from '@/lib/utils/pluralize';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateTimeCompact, formatDateTime, formatDateOnly } from '@/lib/utils/format-date';

const TRACKING_TYPE_LABEL: Record<string, string> = {
  QUANTITY: 'Quantity',
  BATCH: 'Batch',
  SERIALIZED: 'Serialized',
};

const PART_AUDIT_ACTION_LABEL: Record<string, string> = {
  'part.created': 'Part created',
  'part.updated': 'Part updated',
  'part.alternative_units_updated': 'Alternative units updated',
  'part.fitment_added': 'Vehicle fitment added',
  'part.fitment_updated': 'Vehicle fitment updated',
  'part.fitment_removed': 'Vehicle fitment removed',
  'part.selling_price_set': 'Selling price updated',
};

function formatQty(value: unknown): string {
  return Number(value).toLocaleString('en-NG', { maximumFractionDigits: 3 });
}

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [lastEdit, auditTrail] = await Promise.all([getLastEditInfo('Part', id, 'part.updated'), getPartAuditTrail(id)]);

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
      {status === 'selling_price_set' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Selling price updated." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {part.trackingType === 'BATCH' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Batches</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Revenue and Profit are estimates using the Part&apos;s current Selling Price — the real amount actually
                charged for stock sold in the past may have differed if the price has changed since.
              </p>
              {part.batches.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No batches recorded yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                        <th className="px-3 py-2">Batch No.</th>
                        <th className="px-3 py-2">Source GRN</th>
                        <th className="px-3 py-2">Received</th>
                        <th className="px-3 py-2">Sold So Far</th>
                        <th className="px-3 py-2">Remaining</th>
                        <th className="px-3 py-2">Revenue (Est.)</th>
                        <th className="px-3 py-2">Profit (Est.)</th>
                        <th className="px-3 py-2">Received At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.batches.map((batch: (typeof part.batches)[number]) => {
                        const received = Number(batch.receivedQuantity);
                        const remaining = Number(batch.remainingQuantity);
                        const soldSoFar = Math.max(0, received - remaining);
                        const unitCostForBatch = batch.goodsReceiptLine?.unitCost !== null && batch.goodsReceiptLine?.unitCost !== undefined ? Number(batch.goodsReceiptLine.unitCost) : null;
                        const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                        const revenue = sellingPrice !== null ? soldSoFar * sellingPrice : null;
                        const cogs = unitCostForBatch !== null ? soldSoFar * unitCostForBatch : null;
                        const profit = revenue !== null && cogs !== null ? revenue - cogs : null;
                        return (
                          <tr key={batch.id} className="border-b border-[var(--ejo-border)] last:border-0">
                            <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{batch.batchNumber}</td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                              {batch.goodsReceiptLine?.goodsReceipt ? (
                                <LoadingLink href={`/inventory/goods-receipts/${batch.goodsReceiptLine.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">
                                  {batch.goodsReceiptLine.goodsReceipt.referenceNumber}
                                </LoadingLink>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                              {formatQty(received)} {pluralizeWord(received, part.baseUnitOfMeasure)}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text)]">
                              {formatQty(soldSoFar)} {pluralizeWord(soldSoFar, part.baseUnitOfMeasure)}
                            </td>
                            <td className={`px-3 py-2 ${remaining === 0 ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-text)]'}`}>
                              {formatQty(remaining)} {pluralizeWord(remaining, part.baseUnitOfMeasure)}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text)]">{revenue !== null ? formatNaira(revenue) : '—'}</td>
                            <td className={`px-3 py-2 font-medium ${profit !== null && profit < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                              {profit !== null ? formatNaira(profit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{formatDateOnly(new Date(batch.receivedAt))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totalReceived = part.batches.reduce((sum: number, b: (typeof part.batches)[number]) => sum + Number(b.receivedQuantity), 0);
                        const totalRemaining = part.batches.reduce((sum: number, b: (typeof part.batches)[number]) => sum + Number(b.remainingQuantity), 0);
                        const totalSold = Math.max(0, totalReceived - totalRemaining);
                        const totalRevenueAndProfit = part.batches.reduce(
                          (acc: { revenue: number; profit: number }, batch: (typeof part.batches)[number]) => {
                            const received = Number(batch.receivedQuantity);
                            const remaining = Number(batch.remainingQuantity);
                            const soldSoFar = Math.max(0, received - remaining);
                            const unitCostForBatch = batch.goodsReceiptLine?.unitCost !== null && batch.goodsReceiptLine?.unitCost !== undefined ? Number(batch.goodsReceiptLine.unitCost) : null;
                            const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                            const revenue = sellingPrice !== null ? soldSoFar * sellingPrice : 0;
                            const cogs = unitCostForBatch !== null ? soldSoFar * unitCostForBatch : 0;
                            return { revenue: acc.revenue + revenue, profit: acc.profit + (revenue - cogs) };
                          },
                          { revenue: 0, profit: 0 },
                        );
                        return (
                          <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                            <td className="px-3 py-2" colSpan={2}>
                              Total
                            </td>
                            <td className="px-3 py-2">
                              {formatQty(totalReceived)} {pluralizeWord(totalReceived, part.baseUnitOfMeasure)}
                            </td>
                            <td className="px-3 py-2">
                              {formatQty(totalSold)} {pluralizeWord(totalSold, part.baseUnitOfMeasure)}
                            </td>
                            <td className="px-3 py-2">
                              {formatQty(totalRemaining)} {pluralizeWord(totalRemaining, part.baseUnitOfMeasure)}
                            </td>
                            <td className="px-3 py-2">{formatNaira(totalRevenueAndProfit.revenue)}</td>
                            <td className={totalRevenueAndProfit.profit < 0 ? 'px-3 py-2 text-[var(--ejo-error)]' : 'px-3 py-2 text-[var(--ejo-success)]'}>
                              {formatNaira(totalRevenueAndProfit.profit)}
                            </td>
                            <td />
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                  {part.batches.some((b: (typeof part.batches)[number]) => b.consumptions.length > 0) ? (
                    <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">
                        Sold To — real trace of every real draw against a batch, for warranty or quality-defect reference
                      </p>
                      <div className="space-y-1.5">
                        {part.batches
                          .flatMap((batch: (typeof part.batches)[number]) => batch.consumptions.map((c: (typeof batch.consumptions)[number]) => ({ batch, c })))
                          .map(({ batch, c }: { batch: (typeof part.batches)[number]; c: (typeof part.batches)[number]['consumptions'][number] }) => (
                            <div key={c.id} className="flex items-center justify-between text-xs">
                              <span className="text-[var(--ejo-text)]">
                                {formatQty(Number(c.quantityTaken))} {pluralizeWord(Number(c.quantityTaken), part.baseUnitOfMeasure)} from{' '}
                                <span className="font-medium">{batch.batchNumber}</span> — {c.slipLine.slip.jobCard.customer.fullName}
                              </span>
                              <LoadingLink href={`/workshop/parts-requests/${c.slipLine.slip.id}`} className="text-[var(--ejo-primary)] hover:underline">
                                {c.slipLine.slip.referenceNumber} · {c.slipLine.slip.jobCard.jobNumber}
                              </LoadingLink>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : part.trackingType === 'SERIALIZED' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Serial Numbers</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Every real unit ever received, individually tracked — Profit is an estimate using the Part&apos;s current
                Selling Price for each unit already issued out; a unit still In Stock has no profit yet since it
                hasn&apos;t sold.
              </p>
              {part.serials.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No serial numbers recorded yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                        <th className="px-3 py-2">Serial Number</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Destination PRS</th>
                        <th className="px-3 py-2">Source GRN</th>
                        <th className="px-3 py-2">Profit (Est.)</th>
                        <th className="px-3 py-2">Received At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.serials.map((serial: (typeof part.serials)[number]) => {
                        const unitCostForSerial = serial.goodsReceiptLine?.unitCost !== null && serial.goodsReceiptLine?.unitCost !== undefined ? Number(serial.goodsReceiptLine.unitCost) : null;
                        const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                        const isIssued = serial.status !== 'IN_STOCK';
                        const profit = isIssued && sellingPrice !== null && unitCostForSerial !== null ? sellingPrice - unitCostForSerial : null;
                        return (
                          <tr key={serial.id} className="border-b border-[var(--ejo-border)] last:border-0">
                            <td className="px-3 py-2 font-medium text-[var(--ejo-text)]">{serial.serialNumber}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  isIssued ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' : 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                                }`}
                              >
                                {isIssued ? 'Issued' : 'In Stock'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                              {serial.issuedToSlipLine ? (
                                <LoadingLink href={`/workshop/parts-requests/${serial.issuedToSlipLine.slip.id}`} className="text-[var(--ejo-primary)] hover:underline">
                                  {serial.issuedToSlipLine.slip.referenceNumber}
                                </LoadingLink>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                              {serial.goodsReceiptLine?.goodsReceipt ? (
                                <LoadingLink href={`/inventory/goods-receipts/${serial.goodsReceiptLine.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">
                                  {serial.goodsReceiptLine.goodsReceipt.referenceNumber}
                                </LoadingLink>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={`px-3 py-2 font-medium ${profit !== null && profit < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                              {profit !== null ? formatNaira(profit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{formatDateOnly(new Date(serial.receivedAt))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totalUnits = part.serials.length;
                        const issuedCount = part.serials.filter((s: (typeof part.serials)[number]) => s.status !== 'IN_STOCK').length;
                        const inStockCount = totalUnits - issuedCount;
                        const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                        const totalProfit = part.serials.reduce((sum: number, s: (typeof part.serials)[number]) => {
                          if (s.status === 'IN_STOCK') return sum;
                          const unitCostForSerial = s.goodsReceiptLine?.unitCost !== null && s.goodsReceiptLine?.unitCost !== undefined ? Number(s.goodsReceiptLine.unitCost) : null;
                          if (sellingPrice === null || unitCostForSerial === null) return sum;
                          return sum + (sellingPrice - unitCostForSerial);
                        }, 0);
                        return (
                          <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                            <td className="px-3 py-2">
                              {pluralizeWord(totalUnits, 'Unit')} total ({inStockCount} in stock, {issuedCount} issued)
                            </td>
                            <td />
                            <td />
                            <td />
                            <td className={totalProfit < 0 ? 'px-3 py-2 text-[var(--ejo-error)]' : 'px-3 py-2 text-[var(--ejo-success)]'}>{formatNaira(totalProfit)}</td>
                            <td />
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Stock Summary</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                This Part is tracked as a running total, not by individual batch or serial — Revenue and Profit are
                estimates using the Part&apos;s current Selling Price against the average real cost across every
                delivery received so far.
              </p>

              {part.goodsReceiptLines.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">Deliveries — every real GRN this running total is built from</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                          <th className="px-3 py-2">Source GRN</th>
                          <th className="px-3 py-2">Received</th>
                          <th className="px-3 py-2">Sold So Far</th>
                          <th className="px-3 py-2">Remaining</th>
                          <th className="px-3 py-2">Revenue (Est.)</th>
                          <th className="px-3 py-2">Profit (Est.)</th>
                          <th className="px-3 py-2">Received At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // A quantity-tracked Part keeps no real
                          // batch of its own to hold a genuine
                          // remainingQuantity the way BATCH-tracked
                          // Parts do — so this walks the exact same
                          // real FIFO order (oldest delivery first)
                          // against the real total ever consumed, to
                          // compute an honest virtual "how much of
                          // THIS delivery is sold vs left" — the same
                          // real reasoning the Batches table already
                          // uses, just derived here rather than
                          // stored, since there's no batch row to
                          // store it on.
                          const fifoLines = [...part.goodsReceiptLines].sort(
                            (a: (typeof part.goodsReceiptLines)[number], b: (typeof part.goodsReceiptLines)[number]) =>
                              new Date(a.goodsReceipt.receivedAt).getTime() - new Date(b.goodsReceipt.receivedAt).getTime(),
                          );
                          const totalConsumed = part.quantityConsumptions.reduce((sum: number, c: (typeof part.quantityConsumptions)[number]) => sum + Number(c.quantityTaken), 0);
                          let remainingToAllocate = totalConsumed;
                          const soldByLineId = new Map<string, number>();
                          for (const line of fifoLines) {
                            const receivedQty = Number(line.quantityInBaseUnit);
                            const soldFromThisLine = Math.min(remainingToAllocate, receivedQty);
                            soldByLineId.set(line.id, soldFromThisLine);
                            remainingToAllocate -= soldFromThisLine;
                          }
                          const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                          return part.goodsReceiptLines.map((line: (typeof part.goodsReceiptLines)[number]) => {
                            const received = Number(line.quantityInBaseUnit);
                            const soldSoFar = soldByLineId.get(line.id) ?? 0;
                            const remaining = received - soldSoFar;
                            const unitCostForLine = received > 0 && line.totalCost !== null ? Number(line.totalCost) / received : null;
                            const revenue = sellingPrice !== null ? soldSoFar * sellingPrice : null;
                            const cogs = unitCostForLine !== null ? soldSoFar * unitCostForLine : null;
                            const profit = revenue !== null && cogs !== null ? revenue - cogs : null;
                            return (
                              <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                                <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                                  <LoadingLink href={`/inventory/goods-receipts/${line.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">
                                    {line.goodsReceipt.referenceNumber}
                                  </LoadingLink>
                                </td>
                                <td className="px-3 py-2 text-[var(--ejo-text-muted)]">
                                  {formatQty(received)} {pluralizeWord(received, part.baseUnitOfMeasure)}
                                </td>
                                <td className="px-3 py-2 text-[var(--ejo-text)]">
                                  {formatQty(soldSoFar)} {pluralizeWord(soldSoFar, part.baseUnitOfMeasure)}
                                </td>
                                <td className={`px-3 py-2 ${remaining === 0 ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-text)]'}`}>
                                  {formatQty(remaining)} {pluralizeWord(remaining, part.baseUnitOfMeasure)}
                                </td>
                                <td className="px-3 py-2 text-[var(--ejo-text)]">{revenue !== null ? formatNaira(revenue) : '—'}</td>
                                <td className={`px-3 py-2 font-medium ${profit !== null && profit < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                                  {profit !== null ? formatNaira(profit) : '—'}
                                </td>
                                <td className="px-3 py-2 text-[var(--ejo-text-muted)]">{formatDateOnly(new Date(line.goodsReceipt.receivedAt))}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const totalReceived = part.goodsReceiptLines.reduce((sum: number, l: (typeof part.goodsReceiptLines)[number]) => sum + Number(l.quantityInBaseUnit), 0);
                          const totalSold = part.quantityConsumptions.reduce((sum: number, c: (typeof part.quantityConsumptions)[number]) => sum + Number(c.quantityTaken), 0);
                          const totalRemaining = Math.max(0, totalReceived - totalSold);
                          const totalCostReceived = part.goodsReceiptLines.reduce((sum: number, l: (typeof part.goodsReceiptLines)[number]) => sum + (l.totalCost !== null ? Number(l.totalCost) : 0), 0);
                          const averageUnitCost = totalReceived > 0 ? totalCostReceived / totalReceived : null;
                          const sellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
                          const totalRevenue = sellingPrice !== null ? totalSold * sellingPrice : null;
                          const totalCogs = averageUnitCost !== null ? totalSold * averageUnitCost : null;
                          const totalProfit = totalRevenue !== null && totalCogs !== null ? totalRevenue - totalCogs : null;
                          return (
                            <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                              <td className="px-3 py-2">Total</td>
                              <td className="px-3 py-2">
                                {formatQty(totalReceived)} {pluralizeWord(totalReceived, part.baseUnitOfMeasure)}
                              </td>
                              <td className="px-3 py-2">
                                {formatQty(totalSold)} {pluralizeWord(totalSold, part.baseUnitOfMeasure)}
                              </td>
                              <td className="px-3 py-2">
                                {formatQty(totalRemaining)} {pluralizeWord(totalRemaining, part.baseUnitOfMeasure)}
                              </td>
                              <td className="px-3 py-2">{totalRevenue !== null ? formatNaira(totalRevenue) : '—'}</td>
                              <td className={totalProfit !== null && totalProfit < 0 ? 'px-3 py-2 text-[var(--ejo-error)]' : 'px-3 py-2 text-[var(--ejo-success)]'}>
                                {totalProfit !== null ? formatNaira(totalProfit) : '—'}
                              </td>
                              <td />
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              ) : null}

              {part.quantityConsumptions.length > 0 ? (
                <div className="mt-6 border-t border-[var(--ejo-border)] pt-4">
                  <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">
                    Sold To — real trace of every real draw against this Part, for warranty or quality-defect reference
                  </p>
                  <div className="space-y-1.5">
                    {part.quantityConsumptions.map((c: (typeof part.quantityConsumptions)[number]) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--ejo-text)]">
                          {formatQty(Number(c.quantityTaken))} {pluralizeWord(Number(c.quantityTaken), part.baseUnitOfMeasure)} — {c.slipLine.slip.jobCard.customer.fullName}
                        </span>
                        <LoadingLink href={`/workshop/parts-requests/${c.slipLine.slip.id}`} className="text-[var(--ejo-primary)] hover:underline">
                          {c.slipLine.slip.referenceNumber} · {c.slipLine.slip.jobCard.jobNumber}
                        </LoadingLink>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {part.trackingType === 'SERIALIZED' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Units In Stock</h2>
              {(() => {
                // A real bug fixed here: getPart()'s own serials query
                // was widened to fetch every unit ever received (for
                // the fuller Serial Numbers history table below), not
                // just the ones still in stock — this section still
                // needs its own explicit filter now that the upstream
                // query no longer does it, or an already-issued unit
                // would keep showing here as if it were still
                // available to hand out again.
                const inStockSerials = part.serials.filter((s: (typeof part.serials)[number]) => s.status === 'IN_STOCK');
                return inStockSerials.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No units currently in stock.</p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {inStockSerials.map((serial: (typeof part.serials)[number]) => (
                      <span
                        key={serial.id}
                        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]"
                      >
                        {serial.serialNumber}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : null}

          {part.alternativeUnits.length > 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Alternative Units</h2>
              <ul className="mt-3 space-y-1 text-sm text-[var(--ejo-text)]">
                {part.alternativeUnits.map((unit: (typeof part.alternativeUnits)[number]) => (
                  <li key={unit.id}>
                    1 {unit.unitName} = {formatQty(unit.conversionFactor)} {pluralizeWord(Number(unit.conversionFactor), part.baseUnitOfMeasure)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <SellingPriceCalculator
            key={part.sellingPrice?.toString() ?? 'unset'}
            partId={part.id}
            partName={part.name}
            baseUnitOfMeasure={part.baseUnitOfMeasure}
            currentSellingPrice={part.sellingPrice !== null ? Number(part.sellingPrice) : null}
            lastReceipt={
              part.goodsReceiptLines[0]
                ? {
                    referenceNumber: part.goodsReceiptLines[0].goodsReceipt.referenceNumber,
                    quantityReceivedInUnit: Number(part.goodsReceiptLines[0].quantityReceivedInUnit),
                    unitUsed: part.goodsReceiptLines[0].unitUsed,
                    quantityInBaseUnit: Number(part.goodsReceiptLines[0].quantityInBaseUnit),
                    unitCostInBaseUnit: part.goodsReceiptLines[0].unitCost !== null ? Number(part.goodsReceiptLines[0].unitCost) : null,
                    totalCost: part.goodsReceiptLines[0].totalCost !== null ? Number(part.goodsReceiptLines[0].totalCost) : null,
                  }
                : null
            }
          />

          <TargetMarginEditor
            key={part.targetMarginPercent?.toString() ?? 'unset'}
            partId={part.id}
            currentTargetMarginPercent={part.targetMarginPercent !== null ? Number(part.targetMarginPercent) : null}
          />

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
              {part.stock ? formatQty(part.stock.quantityOnHand) : '0'}{' '}
              <span className="text-sm font-normal text-[var(--ejo-text-muted)]">
                {pluralizeWord(part.stock ? Number(part.stock.quantityOnHand) : 0, part.baseUnitOfMeasure)}
              </span>
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

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit Trail</h2>
            {auditTrail.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No edits recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {auditTrail.map((entry: (typeof auditTrail)[number]) => (
                  <li key={entry.id} className="text-sm">
                    <p className="font-medium text-[var(--ejo-text)]">{PART_AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</p>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{entry.userName}</p>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(new Date(entry.createdAt))}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
