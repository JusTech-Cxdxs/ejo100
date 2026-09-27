import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getWarrantyClaim, getWarrantyClaimAuditTrail } from '@/lib/actions/warranty-claims';
import { getWarrantyRoles } from '@/lib/actions/warranty';
import { requireUser } from '@/lib/actions/workshop';
import {
  updateWarrantyClaimFormAction,
  submitWarrantyClaimForApprovalFormAction,
  approveWarrantyClaimFormAction,
  sendBackWarrantyClaimFormAction,
  markWarrantyClaimSubmittedFormAction,
  recordWarrantyClaimDecisionFormAction,
  recordWarrantyClaimSettlementFormAction,
  reopenRejectedWarrantyClaimFormAction,
  cancelWarrantyClaimFormAction,
  recordFailedPartSentFormAction,
  recordFailedPartReceivedFormAction,
  recordReplacementReceivedFormAction,
  recordRepairedPartReturnedFormAction,
} from '@/lib/actions/warranty-claims-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { WarrantyClaimFields } from '@/components/WarrantyClaimFields';
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, REMEDY_LABEL, PART_RETURN_LABEL, coverageLabel } from '@/lib/warranty-claim-status';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BANNER: Record<string, string> = {
  created: 'Draft claim saved — complete the readiness items, then send it for approval.',
  saved: 'Draft saved.',
  sent_for_approval: 'Sent for approval — the approvers have been notified.',
  approved: 'Approved.',
  sent_back: 'Sent back to draft — the person who raised it has been notified.',
  submitted: 'Recorded as submitted to the provider.',
  decision_recorded: "Provider's decision recorded.",
  settled: 'Settlement recorded — the claim is closed.',
  reopened: 'Reopened as a draft for resubmission.',
  cancelled: 'Claim cancelled.',
  part_sent: 'Failed part recorded as sent to the provider.',
  part_received: 'Failed part recorded as received by the provider.',
};

const ACTION_LABEL: Record<string, string> = {
  'warranty_claim.created': 'Claim opened',
  'warranty_claim.updated': 'Draft edited',
  'warranty_claim.sent_for_approval': 'Sent for approval',
  'warranty_claim.hod_approved': 'Approved by the Warranty HOD',
  'warranty_claim.manager_approved': 'Approved by the Branch Manager',
  'warranty_claim.sent_back': 'Sent back to draft',
  'warranty_claim.submitted': 'Submitted to the provider',
  'warranty_claim.decision_recorded': "Provider's decision recorded",
  'warranty_claim.settled': 'Settlement recorded',
  'warranty_claim.reopened': 'Reopened for resubmission',
  'warranty_claim.cancelled': 'Claim cancelled',
  'warranty_claim.part_sent': 'Failed part sent to the provider',
  'warranty_claim.part_received_by_provider': 'Failed part received by the provider',
  'warranty_claim.replacement_received': 'Replacement part received — claim settled',
  'warranty_claim.repaired_part_returned': 'Repaired part returned — claim settled',
};

export default async function WarrantyClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [c, trail, roles, viewer] = await Promise.all([getWarrantyClaim(id), getWarrantyClaimAuditTrail(id), getWarrantyRoles(), requireUser()]);
  if (!c) notFound();
  const r = c.readiness;
  const editing = edit === '1' && c.status === 'DRAFT' && roles.isStaff;
  const own = c.createdById === viewer.id && !roles.isMaster;
  const atMyStep = (c.status === 'PENDING_HOD' && (roles.isHod || roles.isMaster)) || (c.status === 'PENDING_MANAGER' && (roles.isManager || roles.isMaster));
  const claimed = Number(c.claimedAmount);
  const approved = c.approvedAmount !== null ? Number(c.approvedAmount) : null;
  const settled = c.settledAmount !== null ? Number(c.settledAmount) : null;
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const btnLine = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const [jobCards, services] =
    editing && c.vehicleId
      ? await Promise.all([
          prisma.jobCard.findMany({ where: { vehicleId: c.vehicleId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, jobNumber: true, createdAt: true } }),
          prisma.vehicleService.findMany({ where: { vehicleId: c.vehicleId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, serviceNumber: true, createdAt: true } }),
        ])
      : [[], []];
  const steps: { label: string; done: boolean; who?: string | null; at?: Date | null }[] = [
    { label: 'Draft', done: true, who: c.createdBy.fullName, at: c.createdAt },
    { label: 'Warranty HOD', done: Boolean(c.hodApprovedAt), who: c.hodApprovedBy?.fullName, at: c.hodApprovedAt },
    { label: 'Branch Manager', done: Boolean(c.managerApprovedAt), who: c.managerApprovedBy?.fullName, at: c.managerApprovedAt },
    { label: 'With the provider', done: Boolean(c.submittedAt), who: c.submittedBy?.fullName, at: c.submittedAt },
    { label: 'Decision', done: Boolean(c.decidedAt), who: c.decidedBy?.fullName, at: c.decidedAt },
    { label: 'Settled', done: Boolean(c.settledAt), who: c.settledBy?.fullName, at: c.settledAt },
  ];

  return (
    <div className="p-8">
      <LoadingLink href="/warranty/claims" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Claims</LoadingLink>
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{c.claimNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {c.causalPart} · against{' '}
            <LoadingLink href={`/warranty/${c.warranty.id}`} className="text-[var(--ejo-primary)] hover:underline">{c.warranty.warrantyNumber}</LoadingLink> · {c.provider.name}
            {c.resubmissionCount > 0 ? ` · resubmission ${c.resubmissionCount}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span>
          <PrintMenu orgHref={`/print/warranty-claims/${c.id}`} clientHref={`/print/warranty-claims/${c.id}?variant=client`} clientLabel="Provider Copy" />
        </div>
      </div>

      {c.status === 'DRAFT' && c.returnReason ? (
        <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm text-[var(--ejo-text)]">
          <span className="font-medium">To fix before sending again:</span> {c.returnReason}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${s.done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{s.done ? '✓' : `${i + 1}.`} {s.label}</p>
            {s.done && s.who ? <p className="text-[var(--ejo-text-muted)]">{s.who}</p> : null}
            {s.done && s.at ? <p className="text-[var(--ejo-text-muted)]">{formatDateOnly(s.at)}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateWarrantyClaimFormAction} className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="claimId" value={c.id} />
              <WarrantyClaimFields
                defaults={{
                  complaint: c.complaint, cause: c.cause, correction: c.correction, causalPart: c.causalPart, causalPartNumber: c.causalPartNumber,
                  failureDate: new Date(c.failureDate).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }), failureReading: c.failureReading,
                  labourAmount: Number(c.labourAmount), partsAmount: Number(c.partsAmount), otherAmount: Number(c.otherAmount),
                  jobCardId: c.jobCardId, vehicleServiceId: c.vehicleServiceId,
                  remedy: c.remedy, partReturnRequired: c.partReturnRequired,
                }}
                jobCards={jobCards.map((j: (typeof jobCards)[number]) => ({ id: j.id, label: `${j.jobNumber} — ${formatDateOnly(j.createdAt)}` }))}
                vehicleServices={services.map((v: (typeof services)[number]) => ({ id: v.id, label: `${v.serviceNumber} — ${formatDateOnly(v.createdAt)}` }))}
              />
              <div className="flex gap-2">
                <SubmitButton label="Save draft" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                <LoadingLink href={`/warranty/claims/${c.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</LoadingLink>
              </div>
            </form>
          ) : (
            <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm">
              {([['Complaint', c.complaint], ['Cause', c.cause], ['Correction', c.correction]] as const).map(([t, v]) => (
                <div key={t}><p className="text-xs font-medium text-[var(--ejo-text-muted)]">{t}</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{v || '—'}</p></div>
              ))}
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Causal part</p><p className="text-[var(--ejo-text)]">{c.causalPart || '—'}{c.causalPartNumber ? ` (${c.causalPartNumber})` : ''}</p></div>
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Failure</p><p className="text-[var(--ejo-text)]">{formatDateOnly(c.failureDate)}{c.failureReading !== null ? ` at ${c.failureReading.toLocaleString('en-NG')} km` : ''}</p></div>
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Deadline to submit</p><p className="text-[var(--ejo-text)]">{c.deadlineAt ? formatDateOnly(c.deadlineAt) : 'Not set by the provider'}</p></div>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-[var(--ejo-text-muted)]">Labour</td><td className="py-1 text-right">{naira(Number(c.labourAmount))}</td></tr>
                  <tr><td className="py-1 text-[var(--ejo-text-muted)]">Parts</td><td className="py-1 text-right">{naira(Number(c.partsAmount))}</td></tr>
                  <tr><td className="py-1 text-[var(--ejo-text-muted)]">Other (incl. fluids)</td><td className="py-1 text-right">{naira(Number(c.otherAmount))}</td></tr>
                  <tr className="border-t border-[var(--ejo-border)] font-semibold"><td className="py-1">Claimed</td><td className="py-1 text-right">{naira(claimed)}</td></tr>
                  {approved !== null ? <tr><td className="py-1 text-[var(--ejo-text-muted)]">Approved by the provider</td><td className="py-1 text-right">{naira(approved)}</td></tr> : null}
                  {settled !== null ? <tr><td className="py-1 text-[var(--ejo-text-muted)]">Received</td><td className="py-1 text-right text-[var(--ejo-success)]">{naira(settled)}</td></tr> : null}
                  {approved !== null && settled !== null && settled < approved ? <tr><td className="py-1 text-[var(--ejo-warning)]">Shortfall</td><td className="py-1 text-right text-[var(--ejo-warning)]">{naira(approved - settled)}</td></tr> : null}
                </tbody>
              </table>
              <div className="grid gap-3 border-t border-[var(--ejo-border)] pt-3 sm:grid-cols-2">
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Remedy</p><p className="text-[var(--ejo-text)]">{REMEDY_LABEL[c.remedy]}</p></div>
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Policy pays for</p><p className="text-[var(--ejo-text)]">{coverageLabel(c.warranty.policy)}</p></div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-[var(--ejo-text-muted)]">Failed part</p>
                  <p className="text-[var(--ejo-text)]">
                    {c.partReturnRequired ? PART_RETURN_LABEL[c.partReturnStatus ?? 'AWAITING'] : 'Not required by the provider'}
                    {c.partSentReference ? ` — ref ${c.partSentReference}` : ''}
                    {c.partSentAt ? ` · sent ${formatDateOnly(c.partSentAt)}` : ''}
                    {c.partReceivedAt ? ` · received ${formatDateOnly(c.partReceivedAt)}` : ''}
                  </p>
                </div>
                {c.replacementSerial ? <div><p className="text-xs text-[var(--ejo-text-muted)]">Replacement serial</p><p className="text-[var(--ejo-text)]">{c.replacementSerial}</p></div> : null}
                {c.remedyNotes ? <div className="sm:col-span-2"><p className="text-xs text-[var(--ejo-text-muted)]">Remedy notes</p><p className="text-[var(--ejo-text)]">{c.remedyNotes}</p></div> : null}
              </div>
              {c.providerReference ? <p className="text-xs text-[var(--ejo-text-muted)]">Provider reference: {c.providerReference}</p> : null}
              {c.decisionNotes ? <p className="text-xs text-[var(--ejo-text-muted)]">Provider notes: {c.decisionNotes}</p> : null}
              {c.cancelReason ? <p className="text-xs text-[var(--ejo-text-muted)]">Cancelled: {c.cancelReason}</p> : null}
            </div>
          )}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Evidence</h2>
            <p className="mt-2 text-[var(--ejo-text)]">
              Repair record:{' '}
              {c.jobCard ? <LoadingLink href={`/workshop/job-cards/${c.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">Job Card {c.jobCard.jobNumber}</LoadingLink> : null}
              {c.vehicleService ? <LoadingLink href={`/workshop/vehicle-service/${c.vehicleService.id}`} className="text-[var(--ejo-primary)] hover:underline">Vehicle Service {c.vehicleService.serviceNumber}</LoadingLink> : null}
              {!c.jobCard && !c.vehicleService ? <span className="text-[var(--ejo-warning)]">none linked</span> : null}
            </p>
            {c.vehicle ? (
              <p className="mt-1 text-[var(--ejo-text-muted)]">
                Vehicle:{' '}
                <LoadingLink href={`/workshop/vehicles/${c.vehicle.id}/edit`} className="text-[var(--ejo-primary)] hover:underline">{[c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</LoadingLink>
                {c.vehicle.chassisNumber ? ` · VIN ${c.vehicle.chassisNumber}` : ''}{c.vehicle.plateNumber ? ` · ${c.vehicle.plateNumber}` : ''}
              </p>
            ) : null}
            <p className="mt-3 text-xs font-medium text-[var(--ejo-text-muted)]">Service history (maintenance conditions) — {c.serviceHistory.length}</p>
            {c.serviceHistory.length === 0 ? <p className="text-xs text-[var(--ejo-warning)]">No completed services recorded for this vehicle.</p> : (
              <ul className="mt-1 space-y-0.5 text-xs">
                {c.serviceHistory.map((s: (typeof c.serviceHistory)[number]) => (
                  <li key={s.id}><LoadingLink href={`/workshop/vehicle-service/${s.id}`} className="text-[var(--ejo-primary)] hover:underline">{s.serviceNumber}</LoadingLink> — {formatDateOnly(s.completedAt ?? s.createdAt)}{s.odometerAtService !== null ? ` — ${s.odometerAtService.toLocaleString('en-NG')} km` : ''}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs font-medium text-[var(--ejo-text-muted)]">Repair history — {c.repairHistory.length}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {c.repairHistory.map((j: (typeof c.repairHistory)[number]) => (
                <li key={j.id}><LoadingLink href={`/workshop/job-cards/${j.id}`} className="text-[var(--ejo-primary)] hover:underline">{j.jobNumber}</LoadingLink> — {formatDateOnly(j.createdAt)}{j.mileageAtCheckIn !== null ? ` — ${j.mileageAtCheckIn.toLocaleString('en-NG')} km` : ''}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail
              entries={trail.map((e: (typeof trail)[number]) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const parts = [
                  typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null,
                  typeof meta.providerReference === 'string' ? `Ref: ${meta.providerReference}${meta.late ? ' (after the deadline)' : ''}` : null,
                  typeof meta.decision === 'string' ? `${String(meta.decision).replace('_', ' ').toLowerCase()} — ${naira(Number(meta.approvedAmount ?? 0))}` : null,
                  typeof meta.settledAmount === 'number' ? `Received ${naira(meta.settledAmount)}` : null,
                  typeof meta.readinessScore === 'number' ? `Readiness ${meta.readinessScore}%` : null,
                  typeof meta.reference === 'string' && e.action === 'warranty_claim.part_sent' ? `Ref: ${meta.reference}` : null,
                  typeof meta.replacementSerial === 'string' ? `Serial: ${meta.replacementSerial}` : null,
                ].filter(Boolean);
                return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? e.action, userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) };
              })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Readiness</h2>
              <span className={`text-sm font-bold ${r.ready ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{r.score}%</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              {r.ready ? (r.warnings > 0 ? `Ready — ${r.warnings} ${r.warnings === 1 ? 'warning' : 'warnings'} to consider.` : 'Ready — nothing missing.') : `${r.blockers} ${r.blockers === 1 ? 'item blocks' : 'items block'} sending this claim.`}
            </p>
            <ul className="mt-3 space-y-1.5 text-xs">
              {r.items.map((it) => (
                <li key={it.key} className="flex gap-2">
                  <span className={it.ok ? 'text-[var(--ejo-success)]' : it.blocking ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-warning)]'}>{it.ok ? '✓' : it.blocking ? '✕' : '!'}</span>
                  <span className="text-[var(--ejo-text)]">
                    {it.label}
                    {!it.ok && it.hint ? <span className="block text-[var(--ejo-text-muted)]">{it.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next step</h2>
            {c.status === 'DRAFT' && roles.isStaff ? (
              <>
                {!editing ? <LoadingLink href={`/warranty/claims/${c.id}?edit=1`} className={`block text-center ${btnLine}`}>Edit draft</LoadingLink> : null}
                <form action={submitWarrantyClaimForApprovalFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <SubmitButton label={r.ready ? 'Send for approval' : 'Fix the readiness items first'} pendingLabel="Sending…" className={`${btn} ${r.ready ? '' : 'opacity-60'}`} />
                </form>
              </>
            ) : null}
            {(c.status === 'PENDING_HOD' || c.status === 'PENDING_MANAGER') && (!atMyStep || own) ? (
              <p className="text-xs text-[var(--ejo-text-muted)]">{c.status === 'PENDING_HOD' ? 'Waiting on the Warranty HOD.' : 'Waiting on the Branch Manager.'}{own ? ' You raised this claim, so someone else approves it.' : ''}</p>
            ) : null}
            {atMyStep && !own ? (
              <>
                <form action={approveWarrantyClaimFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <SubmitButton label="Approve" pendingLabel="Approving…" className={btn} />
                </form>
                <form action={sendBackWarrantyClaimFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <textarea name="reason" required rows={2} placeholder="What needs fixing?" className={input} />
                  <SubmitButton label="Send back to draft" pendingLabel="Sending back…" className={btnLine} />
                </form>
              </>
            ) : null}
            {c.status === 'APPROVED_TO_SUBMIT' && roles.isStaff ? (
              <form action={markWarrantyClaimSubmittedFormAction} className="space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="claimId" value={c.id} />
                <p className="text-xs text-[var(--ejo-text-muted)]">Print the claim pack, submit it to {c.provider.name}, then record their reference.</p>
                <input name="providerReference" required placeholder="Provider's claim reference" className={input} />
                <SubmitButton label="Record as submitted" pendingLabel="Saving…" className={btn} />
              </form>
            ) : null}
            {c.status === 'SUBMITTED' ? (
              roles.canApprove ? (
                <form action={recordWarrantyClaimDecisionFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <select name="decision" required className={input}>
                    <option value="ACCEPTED">Accepted in full ({naira(claimed)})</option>
                    <option value="PARTIALLY_ACCEPTED">Partially accepted</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <input name="approvedAmount" type="number" step="0.01" min={0} placeholder="Amount accepted (partial only)" className={input} />
                  <textarea name="notes" rows={2} placeholder="Provider's notes / reason (required if partial or rejected)" className={input} />
                  <SubmitButton label="Record decision" pendingLabel="Saving…" className={btn} />
                </form>
              ) : (
                <p className="text-xs text-[var(--ejo-text-muted)]">With {c.provider.name} — the Warranty HOD or Branch Manager records their decision.</p>
              )
            ) : null}
            {c.partReturnRequired && ['APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(c.status) && roles.isStaff ? (
              c.partReturnStatus === 'AWAITING' ? (
                <form action={recordFailedPartSentFormAction} className="space-y-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <p className="text-xs text-[var(--ejo-text)]">{c.provider.name} needs the failed part back{c.provider.partRetentionDays ? ` (keep it ${c.provider.partRetentionDays} days from submission until they collect or ask for it)` : ''}.</p>
                  <input name="reference" required placeholder="Waybill / courier / delivery reference" className={input} />
                  <SubmitButton label="Record failed part as sent" pendingLabel="Saving…" className={btnLine} />
                </form>
              ) : c.partReturnStatus === 'SENT' ? (
                <form action={recordFailedPartReceivedFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <SubmitButton label="Provider confirmed they received the part" pendingLabel="Saving…" className={btnLine} />
                </form>
              ) : null
            ) : null}
            {(c.status === 'ACCEPTED' || c.status === 'PARTIALLY_ACCEPTED') && roles.canApprove && c.remedy === 'REPLACEMENT' ? (
              <form action={recordReplacementReceivedFormAction} className="space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="claimId" value={c.id} />
                <p className="text-xs text-[var(--ejo-text-muted)]">When the replacement part arrives from {c.provider.name}, record it to close the claim.</p>
                <input name="replacementSerial" placeholder="Replacement part serial (if any)" className={input} />
                <input name="notes" placeholder="Notes (delivery note, condition…)" className={input} />
                <SubmitButton label="Replacement part received" pendingLabel="Saving…" className={btn} />
              </form>
            ) : null}
            {(c.status === 'ACCEPTED' || c.status === 'PARTIALLY_ACCEPTED') && roles.canApprove && c.remedy === 'REPAIR' ? (
              <form action={recordRepairedPartReturnedFormAction} className="space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="claimId" value={c.id} />
                <p className="text-xs text-[var(--ejo-text-muted)]">When {c.provider.name} returns the repaired part, record it to close the claim.</p>
                <input name="notes" placeholder="Notes (repair report, delivery note…)" className={input} />
                <SubmitButton label="Repaired part returned" pendingLabel="Saving…" className={btn} />
              </form>
            ) : null}
            {(c.status === 'ACCEPTED' || c.status === 'PARTIALLY_ACCEPTED') && roles.canApprove && c.remedy === 'REIMBURSEMENT' ? (
              <form action={recordWarrantyClaimSettlementFormAction} className="space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="claimId" value={c.id} />
                <p className="text-xs text-[var(--ejo-text-muted)]">When the money (or credit note) arrives, record it. Approved: {naira(approved ?? 0)}.</p>
                <input name="amount" type="number" step="0.01" min={0} required defaultValue={approved ?? undefined} className={input} />
                <input name="reference" placeholder="Payment / credit note reference" className={input} />
                <SubmitButton label="Record settlement" pendingLabel="Saving…" className={btn} />
              </form>
            ) : null}
            {c.status === 'REJECTED' && roles.isStaff ? (
              <form action={reopenRejectedWarrantyClaimFormAction} className="space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="claimId" value={c.id} />
                <textarea name="reason" required rows={2} placeholder="What will be corrected for the resubmission?" className={input} />
                <SubmitButton label="Reopen for resubmission" pendingLabel="Reopening…" className={btnLine} />
              </form>
            ) : null}
            {['SETTLED', 'CANCELLED'].includes(c.status) ? <p className="text-xs text-[var(--ejo-text-muted)]">This claim is closed.</p> : null}
            {['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT'].includes(c.status) && roles.isStaff ? (
              <details className="pt-1">
                <summary className="cursor-pointer text-xs text-[var(--ejo-text-muted)]">Cancel this claim</summary>
                <form action={cancelWarrantyClaimFormAction} className="mt-2 space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="claimId" value={c.id} />
                  <textarea name="reason" required rows={2} placeholder="Why is it being cancelled?" className={input} />
                  <SubmitButton label="Cancel claim" pendingLabel="Cancelling…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
                </form>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
