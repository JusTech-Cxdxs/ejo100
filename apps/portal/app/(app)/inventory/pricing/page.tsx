import { getStoreBranchId, getPricingAlertSummary, listPricingAlerts } from '@/lib/actions/store';
import { syncPartPriceToTargetMarginFormAction, dismissPricingAlertFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { formatDateTime } from '@/lib/utils/format-date';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL_LOSS: 'Critical Loss',
  DEFICIT: 'Margin Deficit',
  BOOST: 'Margin Boost',
};
const SEVERITY_BADGE_CLASS: Record<string, string> = {
  CRITICAL_LOSS: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  DEFICIT: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  BOOST: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
};

/**
 * The real "Pricing Action Advisor" — every alert here was raised
 * automatically, the moment a real Goods Receipt line made it true
 * (see recordGoodsReceipt), never a manual entry. The summary above
 * the list is real, honest analysis computed fresh from whatever's
 * genuinely open right now — never a stored snapshot that could go
 * stale the moment an alert gets resolved elsewhere.
 */
export default async function PricingCommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; severity?: string; status?: string; error?: string; status_msg?: string }>;
}) {
  const params = await searchParams;
  const defaultBranchId = await getStoreBranchId();
  const branchId = params.branchId ?? defaultBranchId;
  const statusFilter = params.status ?? 'OPEN';
  const [summary, alerts] = await Promise.all([
    getPricingAlertSummary(branchId),
    listPricingAlerts(branchId, { severity: params.severity, status: statusFilter }),
  ]);

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Pricing Command Center</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            Every real delivery cost, auto-compared against each Part&apos;s own target margin the moment it&apos;s
            recorded.
          </p>
        </div>
        <LoadingLink href="/inventory" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
          ← Back to Inventory
        </LoadingLink>
      </div>

      {params.error ? (
        <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-4 py-2.5 text-sm text-[var(--ejo-error)]">
          {params.error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-error)]">Critical Loss — Open</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.openBySeverity.CRITICAL_LOSS}</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            Real exposure at current stock: <span className="font-medium text-[var(--ejo-error)]">{formatNaira(summary.criticalLossExposure)}</span>
          </p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-warning)]">Margin Deficit — Open</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.openBySeverity.DEFICIT}</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            {summary.averageDeficitGapPercent !== null
              ? `Averaging ${summary.averageDeficitGapPercent} points below target`
              : 'No deficit alerts open right now'}
          </p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-success)]">Margin Boost — Open</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.openBySeverity.BOOST}</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Real cost drops worth a second look</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">Repeat Offenders</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{summary.partsWithMultipleOpenAlerts.length}</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Parts with more than one open alert</p>
        </div>
      </div>

      {summary.partsWithMultipleOpenAlerts.length > 0 ? (
        <div className="mt-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Worth a real, deliberate look</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            These Parts haven&apos;t just had one odd delivery — they keep coming up.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.partsWithMultipleOpenAlerts.map((p) => (
              <LoadingLink
                key={p.partId}
                href={`/inventory/parts/${p.partId}`}
                className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1 text-xs text-[var(--ejo-text)] hover:opacity-80"
              >
                {p.partName} <span className="font-medium">({p.openCount})</span>
              </LoadingLink>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {['OPEN', 'RESOLVED', 'DISMISSED'].map((s) => (
          <LoadingLink
            key={s}
            href={`/inventory/pricing?branchId=${branchId}&status=${s}${params.severity ? `&severity=${params.severity}` : ''}`}
            className={`rounded-full px-3 py-1.5 font-medium ${statusFilter === s ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}
          >
            {s === 'OPEN' ? 'Open' : s === 'RESOLVED' ? 'Resolved' : 'Dismissed'}
          </LoadingLink>
        ))}
        <span className="mx-1 self-center text-[var(--ejo-text-muted)]">·</span>
        <LoadingLink
          href={`/inventory/pricing?branchId=${branchId}&status=${statusFilter}`}
          className={`rounded-full px-3 py-1.5 font-medium ${!params.severity ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}
        >
          All
        </LoadingLink>
        {Object.keys(SEVERITY_LABEL).map((sev) => (
          <LoadingLink
            key={sev}
            href={`/inventory/pricing?branchId=${branchId}&status=${statusFilter}&severity=${sev}`}
            className={`rounded-full px-3 py-1.5 font-medium ${params.severity === sev ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}
          >
            {SEVERITY_LABEL[sev]}
          </LoadingLink>
        ))}
      </div>

      <div className="mt-4">
        {alerts.length === 0 ? (
          <p className="text-sm text-[var(--ejo-text-muted)]">No {statusFilter.toLowerCase()} pricing alerts right now.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert: (typeof alerts)[number]) => (
              <div key={alert.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_BADGE_CLASS[alert.severity]}`}>
                        {SEVERITY_LABEL[alert.severity]}
                      </span>
                      <LoadingLink href={`/inventory/parts/${alert.part.id}`} className="text-sm font-semibold text-[var(--ejo-text)] hover:underline">
                        {alert.part.name}
                      </LoadingLink>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                      From {alert.goodsReceiptLine.goodsReceipt.referenceNumber} · {formatDateTime(alert.createdAt)}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-[var(--ejo-text-muted)]">New Cost</dt>
                    <dd className="font-medium text-[var(--ejo-text)]">{formatNaira(Number(alert.newUnitCost))}/{alert.part.baseUnitOfMeasure}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ejo-text-muted)]">Selling Price</dt>
                    <dd className="font-medium text-[var(--ejo-text)]">{formatNaira(Number(alert.sellingPriceAtAlert))}/{alert.part.baseUnitOfMeasure}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ejo-text-muted)]">Actual Margin</dt>
                    <dd className={`font-medium ${Number(alert.actualMarginPercent) < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>
                      {Number(alert.actualMarginPercent).toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ejo-text-muted)]">Target Margin</dt>
                    <dd className="font-medium text-[var(--ejo-text)]">{Number(alert.targetMarginPercentAtAlert).toFixed(1)}%</dd>
                  </div>
                </dl>

                {alert.status === 'OPEN' ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ejo-border)] pt-3">
                    <form action={syncPartPriceToTargetMarginFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="alertId" value={alert.id} />
                      <input type="hidden" name="branchId" value={branchId} />
                      <SubmitButton
                        label="Sync Price to Target"
                        pendingLabel="Syncing…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      />
                    </form>
                    <form action={dismissPricingAlertFormAction} className="flex items-center gap-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="alertId" value={alert.id} />
                      <input type="hidden" name="branchId" value={branchId} />
                      <input
                        name="notes"
                        required
                        placeholder="Reason for keeping the current price…"
                        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2.5 py-1.5 text-xs text-[var(--ejo-text)]"
                      />
                      <SubmitButton
                        label="Dismiss"
                        pendingLabel="Saving…"
                        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                      />
                    </form>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-text-muted)]">
                    {alert.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'} by {alert.resolvedBy?.fullName ?? '—'}
                    {alert.resolvedAt ? ` — ${formatDateTime(alert.resolvedAt)}` : ''}
                    {alert.resolutionNotes ? ` — ${alert.resolutionNotes}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
