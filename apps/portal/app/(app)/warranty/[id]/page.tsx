import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getWarranty, getWarrantyAuditTrail } from '@/lib/actions/warranty';
import { verifyWarrantyFormAction, setWarrantyStatusFormAction } from '@/lib/actions/warranty-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { warrantyCoverage, WARRANTY_STATE_CLASS, WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

const ACTION_LABEL: Record<string, string> = {
  'warranty.registered': 'Warranty registered',
  'warranty.verified': 'Warranty verified — now active',
  'warranty.suspended': 'Warranty suspended',
  'warranty.void': 'Warranty voided',
  'warranty.transferred': 'Warranty transferred',
  'warranty.reinstated': 'Warranty reinstated',
};

const STATUS_BANNER: Record<string, string> = {
  registered: 'Warranty registered — it now needs verifying by a second person before it covers anything.',
  verified: 'Warranty verified — it is now active.',
  status_changed: 'Warranty status updated.',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ejo-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{children}</dd>
    </div>
  );
}

export default async function WarrantyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [w, trail] = await Promise.all([getWarranty(id), getWarrantyAuditTrail(id)]);
  if (!w) notFound();
  const cov = warrantyCoverage(w, w.vehicle?.mileage ?? null);
  const distanceEnd = w.startReading !== null && w.distanceLimit !== null ? w.startReading + w.distanceLimit : null;
  const canChange = w.status !== 'VOID' && w.status !== 'TRANSFERRED';

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Warranty
      </LoadingLink>
      {status && STATUS_BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={STATUS_BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{w.warrantyNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {w.kind === 'ASSET' ? 'Vehicle warranty' : 'Part warranty'} — {w.subjectDescription}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${WARRANTY_STATE_CLASS[cov.state]}`}>{WARRANTY_STATE_LABEL[cov.state]}</span>
          <PrintMenu orgHref={`/print/warranty/${w.id}`} clientHref={`/print/warranty/${w.id}?variant=client`} clientLabel="Customer Copy" />
        </div>
      </div>

      <div className={`mb-6 rounded-[var(--ejo-radius-lg)] border p-4 text-sm ${cov.state === 'COVERED' ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : cov.state === 'EXPIRING_SOON' ? 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
        <p className="font-medium text-[var(--ejo-text)]">{cov.reason}</p>
        {cov.daysLeft !== null && cov.daysLeft > 0 ? (
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            {cov.daysLeft.toLocaleString('en-NG')} {cov.daysLeft === 1 ? 'day' : 'days'} left
            {cov.distanceLeft !== null ? ` · ${cov.distanceLeft.toLocaleString('en-NG')} km left (last known odometer)` : ''}
          </p>
        ) : null}
        {w.policy.isSample ? <p className="mt-1 text-xs font-medium text-[var(--ejo-warning)]">Sample terms — replace with the provider&apos;s real warranty terms before relying on this.</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Coverage</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts">{formatDateOnly(w.startsAt)}{w.startReading !== null ? ` at ${w.startReading.toLocaleString('en-NG')} km` : ''}</Field>
              <Field label="Ends (whichever comes first)">{formatDateOnly(w.endsAt)}{distanceEnd !== null ? ` or ${distanceEnd.toLocaleString('en-NG')} km` : ''}</Field>
              <Field label="Policy">{w.policy.name} ({w.policy.code})</Field>
              <Field label="Provider">{w.provider.name}</Field>
            </dl>
            <div className="mt-4 space-y-3 text-sm">
              <div><p className="text-xs text-[var(--ejo-text-muted)]">What is covered</p><p className="text-[var(--ejo-text)]">{w.coverageSnapshot}</p></div>
              {w.exclusionsSnapshot ? <div><p className="text-xs text-[var(--ejo-text-muted)]">Not covered</p><p className="text-[var(--ejo-text)]">{w.exclusionsSnapshot}</p></div> : null}
              {w.conditionsSnapshot ? <div><p className="text-xs text-[var(--ejo-text-muted)]">Conditions</p><p className="text-[var(--ejo-text)]">{w.conditionsSnapshot}</p></div> : null}
              <p className="text-[11px] text-[var(--ejo-text-muted)]">Terms as they were when this warranty was issued — later changes to the policy never alter them.</p>
            </div>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Traceability</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer">
                {w.customer.fullName}
                <span className="block text-xs text-[var(--ejo-text-muted)]">{[w.customer.email, w.customer.phone].filter(Boolean).join(' · ')}</span>
              </Field>
              {w.vehicle ? (
                <Field label="Vehicle">
                  <LoadingLink href={`/workshop/vehicles/${w.vehicle.id}/edit`} className="text-[var(--ejo-primary)] hover:underline">
                    {[w.vehicle.year, w.vehicle.make, w.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </LoadingLink>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">
                    {[w.vehicle.plateNumber, w.vehicle.chassisNumber ? `VIN ${w.vehicle.chassisNumber}` : null, w.vehicle.mileage !== null ? `${w.vehicle.mileage.toLocaleString('en-NG')} km last recorded` : null].filter(Boolean).join(' · ')}
                  </span>
                </Field>
              ) : null}
              {w.part ? (
                <Field label="Part">
                  <LoadingLink href={`/inventory/parts/${w.part.id}`} className="text-[var(--ejo-primary)] hover:underline">
                    {w.part.name}{w.part.partNumber ? ` (${w.part.partNumber})` : ''}
                  </LoadingLink>
                  {w.quantity !== null && w.kind === 'PART' ? <span className="block text-xs text-[var(--ejo-text-muted)]">Quantity: {Number(w.quantity).toLocaleString('en-NG')}</span> : null}
                </Field>
              ) : null}
              {w.partSerial ? (
                <Field label="Serial number">
                  {w.partSerial.serialNumber}
                  {w.partSerial.goodsReceiptLine ? (
                    <span className="block text-xs">
                      Received on{' '}
                      <LoadingLink href={`/inventory/goods-receipts/${w.partSerial.goodsReceiptLine.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">
                        {w.partSerial.goodsReceiptLine.goodsReceipt.referenceNumber}
                      </LoadingLink>
                    </span>
                  ) : null}
                </Field>
              ) : null}
              {w.jobCard ? (
                <Field label="Job Card">
                  <LoadingLink href={`/workshop/job-cards/${w.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">{w.jobCard.jobNumber}</LoadingLink>
                </Field>
              ) : null}
              {w.vehicleService ? (
                <Field label="Vehicle Service">
                  <LoadingLink href={`/workshop/vehicle-service/${w.vehicleService.id}`} className="text-[var(--ejo-primary)] hover:underline">{w.vehicleService.serviceNumber}</LoadingLink>
                </Field>
              ) : null}
              {w.slipLine ? (
                <Field label="Issued with">
                  <LoadingLink href={`/workshop/parts-requests/${w.slipLine.slip.id}`} className="text-[var(--ejo-primary)] hover:underline">{w.slipLine.slip.referenceNumber}</LoadingLink>
                </Field>
              ) : null}
              <Field label="Origin">{w.origin === 'AUTO' ? 'Issued automatically with a part release' : 'Registered by staff'}</Field>
              <Field label="Issued">
                {formatDateTime(w.issuedAt)}{w.issuedBy ? ` by ${w.issuedBy.fullName}` : ''}
              </Field>
              {w.verifiedAt ? <Field label="Verified">{formatDateTime(w.verifiedAt)}{w.verifiedBy ? ` by ${w.verifiedBy.fullName}` : ''}</Field> : null}
              {w.evidenceNote ? <Field label="Evidence">{w.evidenceNote}</Field> : null}
            </dl>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            {trail.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Issued automatically — see the linked record for the release.</p>
            ) : (
              <AuditTrail
                entries={trail.map((e: (typeof trail)[number]) => {
                  const meta = (e.metadata ?? {}) as Record<string, unknown>;
                  return {
                    id: e.id,
                    actionLabel: ACTION_LABEL[e.action] ?? e.action,
                    userName: e.userName,
                    detail: typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : typeof meta.evidence === 'string' ? `Evidence: ${meta.evidence}` : null,
                    dateLabel: formatDateTime(e.createdAt),
                  };
                })}
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          {w.status === 'PENDING_VERIFICATION' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Verify this warranty</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                A Workshop Manager other than the person who registered it checks the evidence, then verifies it. Until then it covers nothing.
              </p>
              <form action={verifyWarrantyFormAction} className="mt-3">
                <FormPendingOverlay />
                <input type="hidden" name="warrantyId" value={w.id} />
                <SubmitButton label="Evidence checked — verify" pendingLabel="Verifying…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
              </form>
            </div>
          ) : null}
          {canChange ? (
            <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text-muted)]">Change status (Manager)</summary>
              <form action={setWarrantyStatusFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="warrantyId" value={w.id} />
                <select name="status" required className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                  {w.status === 'SUSPENDED' ? <option value="ACTIVE">Reinstate</option> : null}
                  {w.status !== 'SUSPENDED' && w.status !== 'PENDING_VERIFICATION' ? <option value="SUSPENDED">Suspend</option> : null}
                  <option value="VOID">Void</option>
                  {w.kind === 'ASSET' ? <option value="TRANSFERRED">Transferred (ownership changed)</option> : null}
                </select>
                <textarea name="reason" required rows={2} placeholder="Reason (required, recorded on the audit trail)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                <SubmitButton label="Update status" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
              </form>
            </details>
          ) : null}
          {w.statusReason && w.status !== 'ACTIVE' ? (
            <p className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-xs text-[var(--ejo-text-muted)]">Status reason: {w.statusReason}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
