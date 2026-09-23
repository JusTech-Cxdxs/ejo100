import { notFound } from 'next/navigation';
import { getGoodsReceipt, getGoodsReceiptAuditTrail } from '@/lib/actions/store';
import { updateGoodsReceiptFormAction } from '@/lib/actions/store-form-handlers';
import { formatDateTime } from '@/lib/utils/format-date';
import { GoodsReceiptLineCard, type GoodsReceiptLineStockTrace } from '@/components/GoodsReceiptLineCard';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'goods_receipt.recorded': 'Goods Receipt recorded',
  'goods_receipt.updated': 'Supplier / notes updated',
  'goods_receipt.line_cost_updated': 'Line cost corrected',
};


/**
 * One Goods Receipt's own real, permanent record — click through from
 * the list's own reference number, same as a Job Card or a Part gets
 * its own dedicated page. Editing is deliberately narrow: Supplier
 * and Notes (pure record-keeping, no effect on stock or price), and
 * each line's own Unit Cost (the one field a real mistake — like the
 * user's own Coolant example — actually needs correcting). Never
 * quantity, unit, or which Part: those are physical facts about what
 * arrived, and editing them safely would need real stock
 * reconciliation this page doesn't attempt. Every edit here is
 * deliberately loud, not just logged quietly — this is a real
 * financial record, and Store gets notified by email every time,
 * alongside the audit trail below.
 */
type ReceiptWithTrace = NonNullable<Awaited<ReturnType<typeof getGoodsReceipt>>>;
type ReceiptLine = ReceiptWithTrace['lines'][number];
type SlipDestination = { id: string; referenceNumber: string; jobCard: { jobNumber: string; customer: { fullName: string } } | null; vehicleService: { serviceNumber: string; customer: { fullName: string } } | null };

function destination(slip: SlipDestination, quantity: number, detail: string | null): GoodsReceiptLineStockTrace['issuedTo'][number] {
  return {
    slipId: slip.id,
    referenceNumber: slip.referenceNumber,
    sourceNumber: slip.jobCard?.jobNumber ?? slip.vehicleService?.serviceNumber ?? null,
    customerName: slip.jobCard?.customer.fullName ?? slip.vehicleService?.customer.fullName ?? null,
    quantity,
    detail,
  };
}

/**
 * Where this one delivery's stock went — the forward trace (GRN → Part
 * Requests → job → customer), built from the real records for each
 * tracking type: the batch this line created, the serials it brought in,
 * or — for a QUANTITY part — its FIFO layer from the shared engine.
 */
function buildStockTrace(line: ReceiptLine, quantityTraces: ReceiptWithTrace['quantityTraces']): GoodsReceiptLineStockTrace {
  const received = Number(line.quantityInBaseUnit);
  if (line.part.trackingType === 'BATCH') {
    const remaining = line.batches.reduce((sum: number, b: (typeof line.batches)[number]) => sum + Number(b.remainingQuantity), 0);
    const activeBatchId = line.part.batches[0]?.id ?? null;
    return {
      trackingType: 'BATCH',
      received,
      remaining,
      issued: Math.max(0, Math.round((received - remaining) * 10000) / 10000),
      isActive: line.batches.some((b: (typeof line.batches)[number]) => b.id === activeBatchId),
      issuedTo: line.batches.flatMap((b: (typeof line.batches)[number]) =>
        b.consumptions.map((c: (typeof b.consumptions)[number]) => destination(c.slipLine.slip, Number(c.quantityTaken), null)),
      ),
    };
  }
  if (line.part.trackingType === 'SERIALIZED') {
    const issuedSerials = line.serials.filter((sr: (typeof line.serials)[number]) => sr.status !== 'IN_STOCK');
    return {
      trackingType: 'SERIALIZED',
      received,
      remaining: line.serials.length - issuedSerials.length,
      issued: issuedSerials.length,
      isActive: false,
      issuedTo: issuedSerials
        .filter((sr: (typeof issuedSerials)[number]) => sr.issuedToSlipLine)
        .map((sr: (typeof issuedSerials)[number]) => destination(sr.issuedToSlipLine!.slip, 1, `Serial ${sr.serialNumber}`)),
    };
  }
  const trace = quantityTraces.get(line.partId);
  const layer = trace?.fifo.layers.get(line.id);
  const issuedTo: GoodsReceiptLineStockTrace['issuedTo'] = [];
  for (const release of trace?.releases ?? []) {
    for (const a of trace?.fifo.allocations.get(release.id) ?? []) {
      if (a.goodsReceiptLineId !== line.id) continue;
      issuedTo.push({
        slipId: release.slip.id,
        referenceNumber: release.slip.referenceNumber,
        sourceNumber: release.slip.sourceNumber,
        customerName: release.slip.customerName,
        quantity: a.quantity,
        detail: null,
      });
    }
  }
  return {
    trackingType: 'QUANTITY',
    received,
    remaining: layer?.remaining ?? received,
    issued: layer?.taken ?? 0,
    isActive: trace?.fifo.activeLayerId === line.id,
    issuedTo,
  };
}

export default async function GoodsReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;
  const [receipt, auditTrail] = await Promise.all([getGoodsReceipt(id), getGoodsReceiptAuditTrail(id)]);
  if (!receipt) notFound();

  return (
    <div className="p-8">
      <LoadingLink href="/inventory/goods-receipts" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Goods Receipts
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">{receipt.referenceNumber}</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Received by {receipt.receivedBy.fullName} on {formatDateTime(new Date(receipt.receivedAt))}
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Updated — Store has been notified by email." />
        </div>
      ) : null}
      {status === 'cost_updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Cost corrected — Store has been notified by email." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <form action={updateGoodsReceiptFormAction} className="mt-3 space-y-3">
              <FormPendingOverlay />
              <input type="hidden" name="id" value={receipt.id} />
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Supplier</label>
                <input
                  name="supplierName"
                  required
                  defaultValue={receipt.supplierName}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={receipt.notes ?? ''}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <SubmitButton
                label="Save"
                pendingLabel="Saving…"
                className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
              />
            </form>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">{pluralize(receipt.lines.length, 'Line')}</h2>
            <div className="space-y-3">
              {receipt.lines.map((line: (typeof receipt.lines)[number]) => (
                <GoodsReceiptLineCard
                  key={`${line.id}-${line.totalCost?.toString() ?? 'unset'}`}
                  goodsReceiptId={receipt.id}
                  lineId={line.id}
                  partId={line.part.id}
                  partNumber={line.part.partNumber}
                  stockTrace={buildStockTrace(line, receipt.quantityTraces)}
                  partName={line.part.name}
                  baseUnitOfMeasure={line.part.baseUnitOfMeasure}
                  quantityReceivedInUnit={Number(line.quantityReceivedInUnit)}
                  unitUsed={line.unitUsed}
                  quantityInBaseUnit={Number(line.quantityInBaseUnit)}
                  batchNumber={line.batchNumber}
                  totalCost={line.totalCost !== null ? Number(line.totalCost) : null}
                  unitCost={line.unitCost !== null ? Number(line.unitCost) : null}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit Trail</h2>
          {auditTrail.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No edits recorded — this is exactly as it was first entered.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {auditTrail.map((entry: (typeof auditTrail)[number]) => (
                <li key={entry.id} className="text-sm">
                  <p className="font-medium text-[var(--ejo-text)]">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{entry.userName}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(new Date(entry.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
