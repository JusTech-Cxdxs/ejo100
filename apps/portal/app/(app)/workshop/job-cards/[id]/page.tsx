import { LoadingLink } from '@/components/LoadingLink';
import { notFound } from 'next/navigation';
import { getJobCard, getJobCardAuditTrail, getJobCardEstimate, getJobCardPayments, getCancellationRequests, listTechnicianCandidates, listEligibleSupervisorsForJobCard, listEligibleManagersForBranch, listEligibleFinanceOfficersForBranch, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import { COMMON_ESTIMATE_LINE_DESCRIPTIONS, MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-constants';
import { updateJobCardStatusFormAction, assignTechnicianFormAction, deleteJobCardFormAction, approveJobCardFormAction, rejectJobCardFormAction, acceptTechnicianAssignmentFormAction, rejectTechnicianAssignmentFormAction, reassignSupervisorFormAction, addEstimateLineItemFormAction, updateEstimateLineItemFormAction, deleteEstimateLineItemFormAction, notifySupervisorAboutEstimateFormAction, notifyTechnicianAboutEstimateFormAction, submitEstimateForValidationFormAction, approveEstimateFormAction, approveEstimateAsManagerFormAction, notifyCustomerOfApprovedEstimateFormAction, recordPaymentFormAction, requestJobCardCancellationFormAction, approveCancellationRequestFormAction, declineCancellationRequestFormAction } from '@/lib/actions/workshop-form-handlers';
import { formatDateTime } from '@/lib/utils/format-date';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { PaymentAmountField } from '@/components/PaymentAmountField';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { pluralize } from '@/lib/utils/pluralize';
import { workingDaysBetween } from '@/lib/utils/working-days';

const ALL_STATUSES = [
  'CHECKED_IN',
  'AWAITING_CUSTOMER_APPROVAL',
  'IN_PROGRESS',
  'AWAITING_PARTS',
  'QUALITY_CHECK',
  'COMPLETED',
  'READY_FOR_COLLECTION',
  'CLOSED',
  'CHECKED_OUT',
  'CANCELLED',
] as const;

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  AWAITING_CUSTOMER_APPROVAL: 'Awaiting Customer Approval',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CHECKED_OUT: 'Checked Out',
  CANCELLED: 'Cancelled',
};

// This page never had its own color map before — the top-level status
// badge was hardcoded to the primary (green) color for every single
// status, Cancelled included. Matches the list page's own map exactly,
// so the same status reads the same color everywhere in the app.
const STATUS_COLOR: Record<string, string> = {
  CHECKED_IN: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  IN_PROGRESS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AWAITING_PARTS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  QUALITY_CHECK: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AWAITING_CUSTOMER_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  READY_FOR_COLLECTION: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CHECKED_OUT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

// Falls back to the raw action string for anything not listed — future
// phases add more audit actions (assignment.*, estimate.*, etc.); this
// map only needs updating for a nicer label, never to avoid breaking.
const AUDIT_ACTION_LABEL: Record<string, string> = {
  'job_card.created': 'Job Card created',
  'job_card.approved': 'Job Card approved',
  'job_card.rejected': 'Job Card rejected',
  'job_card.supervisor_reassigned': 'Supervisor reassigned',
  'job_card.status_updated': 'Status updated',
  'assignment.accepted': 'Technician accepted assignment',
  'assignment.rejected': 'Technician rejected assignment',
  'estimate.line_item_added': 'Estimate line added',
  'estimate.line_item_updated': 'Estimate line updated',
  'estimate.line_item_removed': 'Estimate line removed',
  'estimate.submitted': 'Estimate submitted for validation',
  'estimate.approved': 'Estimate approved',
  'estimate.manager_approved': 'Estimate approved by manager',
  'estimate.customer_notified': 'Customer notified of approved estimate',
  'estimate.nudge_to_technician': 'Supervisor notified technician about estimate',
  'estimate.nudge_to_supervisor': 'Technician notified supervisor about estimate',
  'payment.recorded': 'Payment recorded',
  'payment.approved': 'Payment approved — work can proceed',
  'cancellation.requested': 'Cancellation requested',
  'cancellation.approved': 'Cancellation approved',
  'cancellation.declined': 'Cancellation declined',
  'approval.reminder_sent': 'Approval reminder sent',
  'collection.overdue_notice_sent': 'Collection overdue notice sent',
  'collection.ready_reminder_sent': 'Ready-for-collection reminder sent',
};

/** Turns the stored audit metadata into a real, field-level detail
 * line — "who entered price X for Y", not just a generic action label
 * — reading exactly what writeAuditLog() already captures at the point
 * each action happens, not reconstructed after the fact. Returns null
 * when there's genuinely nothing more specific to show. */
function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  switch (entry.action) {
    case 'estimate.line_item_added':
    case 'estimate.line_item_updated': {
      const parts: string[] = [];
      if (typeof meta.type === 'string') parts.push(ESTIMATE_TYPE_LABEL[meta.type] ?? meta.type);
      if (typeof meta.description === 'string') parts.push(`"${meta.description}"`);
      if (typeof meta.quantity === 'number') parts.push(`qty ${meta.quantity}`);
      if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
      else parts.push('no price set');
      return parts.join(' — ');
    }
    case 'estimate.line_item_removed':
      return typeof meta.description === 'string' ? `"${meta.description}"` : null;
    case 'job_card.status_updated': {
      const from = typeof meta.from === 'string' ? (STATUS_LABEL[meta.from] ?? meta.from) : null;
      const to = typeof meta.to === 'string' ? (STATUS_LABEL[meta.to] ?? meta.to) : null;
      return from && to ? `${from} → ${to}` : null;
    }
    case 'job_card.rejected':
    case 'job_card.supervisor_reassigned':
    case 'assignment.rejected':
    case 'cancellation.requested':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'cancellation.approved': {
      const parts: string[] = [];
      if (typeof meta.reason === 'string') parts.push(`Reason: ${meta.reason}`);
      if (typeof meta.notes === 'string' && meta.notes) parts.push(`Note: ${meta.notes}`);
      return parts.join(' — ') || null;
    }
    case 'payment.recorded': {
      const parts: string[] = [];
      if (typeof meta.amount === 'number') parts.push(formatNaira(meta.amount));
      if (typeof meta.method === 'string') parts.push(meta.method === 'CASH' ? 'Cash' : 'Bank Transfer');
      if (typeof meta.notes === 'string' && meta.notes) parts.push(meta.notes);
      return parts.join(' — ') || null;
    }
    case 'payment.approved':
      return typeof meta.totalPaid === 'number' ? `Total confirmed: ${formatNaira(meta.totalPaid)}` : null;
    case 'collection.overdue_notice_sent': {
      const parts: string[] = [];
      if (typeof meta.daysElapsed === 'number') parts.push(`${pluralize(meta.daysElapsed, 'working day')} since cancellation`);
      if (typeof meta.notes === 'string' && meta.notes) parts.push(`Note: ${meta.notes}`);
      return parts.join(' — ') || null;
    }
    default:
      return typeof meta.notes === 'string' && meta.notes ? `Notes: ${meta.notes}` : null;
  }
}

const ESTIMATE_TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part',
  EXTERNAL_PART: 'External Part',
  EXTERNAL_JOB: 'External Job',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PARTIAL: 'Partial Payment',
  DEPOSIT_MET: 'Minimum Met — Balance Pending',
  PAID_IN_FULL: 'Payment Completed',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  PARTIAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  DEPOSIT_MET: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  PAID_IN_FULL: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
};

const ESTIMATE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting supervisor validation',
  APPROVED: 'Awaiting manager review',
  MANAGER_APPROVED: 'Approved',
};

// Prisma returns Decimal fields as Decimal objects (from decimal.js),
// not plain numbers — Number(...) here is a deliberate, safe
// conversion, not a shortcut around it, since these amounts have
// already been rounded to 2dp at write time (see addEstimateLineItem).
function formatNaira(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function JobCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string; editLineId?: string; editStatus?: string }>;
}) {
  const { id } = await params;
  const { status, error, editLineId, editStatus } = await searchParams;
  const [jobCard, technicians, isMasterAdmin, viewerId] = await Promise.all([
    getJobCard(id),
    listTechnicianCandidates(),
    currentUserIsMasterAdmin(),
    currentUserId(),
  ]);
  if (!jobCard) notFound();
  const [auditTrail, eligibleSupervisors, estimate, eligibleManagers, eligibleFinance, payments, cancellationRequests] = await Promise.all([
    getJobCardAuditTrail(id),
    listEligibleSupervisorsForJobCard(id),
    getJobCardEstimate(id),
    listEligibleManagersForBranch(jobCard.branchId),
    listEligibleFinanceOfficersForBranch(jobCard.branchId),
    getJobCardPayments(id),
    getCancellationRequests(id),
  ]);
  const isApprover = isMasterAdmin || jobCard.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || jobCard.assignedTechnician?.id === viewerId;
  const isCreator = isMasterAdmin || jobCard.createdBy.id === viewerId;
  const isEstimateContributor = isMasterAdmin || jobCard.supervisor?.id === viewerId || jobCard.assignedTechnician?.id === viewerId;
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);
  const canRequestCancellation = isCreator || isApprover;
  const pendingCancellationRequest = cancellationRequests.find((r: (typeof cancellationRequests)[number]) => r.status === 'PENDING');
  const paymentsTotal = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount ?? 0), 0);
  const estimateLineItems = estimate?.lineItems ?? [];
  const estimateTotal = estimateLineItems.reduce((sum: number, li: (typeof estimateLineItems)[number]) => sum + Number(li.amount ?? 0), 0);
  const minimumDeposit = Math.round(estimateTotal * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const paymentStatus: 'AWAITING_PAYMENT' | 'PARTIAL' | 'DEPOSIT_MET' | 'PAID_IN_FULL' =
    paymentsTotal <= 0
      ? 'AWAITING_PAYMENT'
      : estimateTotal > 0 && paymentsTotal >= estimateTotal
        ? 'PAID_IN_FULL'
        : estimateTotal > 0 && paymentsTotal >= minimumDeposit
          ? 'DEPOSIT_MET'
          : 'PARTIAL';
  // Cancelled is terminal — dead. The only status change still
  // legitimately available is the vehicle's eventual physical exit.
  const isCancelled = jobCard.status === 'CANCELLED';
  const selectableStatuses = isCancelled ? (['CHECKED_OUT'] as const) : ALL_STATUSES;

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/job-cards" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← All Job Cards
      </LoadingLink>

      {error ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {status === 'job_card_created' ? (
        <div className="mt-4">
          <FormFeedbackBanner kind="success" message="Job Card successfully created." />
        </div>
      ) : null}

      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{jobCard.jobNumber}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[jobCard.status]}`}>
          {STATUS_LABEL[jobCard.status]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            jobCard.approvalStatus === 'APPROVED'
              ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
              : jobCard.approvalStatus === 'REJECTED'
                ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
          }`}
        >
          {jobCard.approvalStatus === 'APPROVED'
            ? `Approved by ${jobCard.approvedBy?.fullName ?? 'supervisor'}`
            : jobCard.approvalStatus === 'REJECTED'
              ? `Rejected — ${jobCard.rejectionReason}`
              : 'Awaiting Supervisor Approval'}
        </span>
        {payments.length > 0 || jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[paymentStatus]}`}>
            {PAYMENT_STATUS_LABEL[paymentStatus]}
          </span>
        ) : null}
      </div>

      <p className="mb-6 text-xs text-[var(--ejo-text-muted)]">
        {(() => {
          // "Days in workshop" — calendar days, since the vehicle is
          // physically present every day including weekends. "Repair
          // duration" — working days specifically, since it reflects
          // actual technician effort for future KPI/performance
          // tracking, not calendar time technicians weren't working.
          const inWorkshopEnd = jobCard.closedAt ?? new Date();
          const daysInWorkshop = Math.max(0, Math.round((inWorkshopEnd.getTime() - jobCard.createdAt.getTime()) / (1000 * 60 * 60 * 24)));
          const parts = [`${pluralize(daysInWorkshop, 'day')} in workshop since check-in`];
          if (jobCard.workStartedAt) {
            const repairEnd = jobCard.completedAt ?? new Date();
            const repairDuration = workingDaysBetween(jobCard.workStartedAt, repairEnd);
            parts.push(
              jobCard.completedAt
                ? `Repair duration: ${pluralize(repairDuration, 'working day')}`
                : `Repair in progress: ${pluralize(repairDuration, 'working day')} so far`,
            );
          }
          return parts.join(' · ');
        })()}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer & Vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.customer.fullName}
                  {jobCard.customer.customerType === 'COMPANY' ? (
                    <span className="ml-2 rounded-full bg-[var(--ejo-info)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-info)]">
                      Company
                    </span>
                  ) : null}
                </dd>
              </div>
              {jobCard.customer.address ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Address</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{jobCard.customer.address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Contact</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.customer.phone || jobCard.customer.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {[jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Plate</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.plateNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-[var(--ejo-text)]">
                  {jobCard.vehicle.chassisNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.mileageAtCheckIn != null ? `${jobCard.mileageAtCheckIn.toLocaleString()} km` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Workshop department</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.department?.name ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Supervisor</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.supervisor?.fullName ?? 'Unassigned'}
                  {jobCard.supervisor ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        jobCard.approvalStatus === 'APPROVED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {jobCard.approvalStatus === 'APPROVED' ? 'Approved' : 'Awaiting approval'}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
                  {jobCard.technicianAcceptanceStatus ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : jobCard.technicianAcceptanceStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {jobCard.technicianAcceptanceStatus === 'ACCEPTED'
                        ? 'Accepted'
                        : jobCard.technicianAcceptanceStatus === 'REJECTED'
                          ? `Rejected — ${jobCard.technicianRejectionReason}`
                          : 'Awaiting response'}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
              Complaints{jobCard.complaints.length > 1 ? ` (${jobCard.complaints.length})` : ''}
            </h2>
            {jobCard.complaints.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {jobCard.complaints.map((c: (typeof jobCard.complaints)[number]) => (
                  <li key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                    <span className="shrink-0 font-medium text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span>
                    <span>{c.description}</span>
                  </li>
                ))}
              </ol>
            ) : (
              // Legacy fallback — a Job Card created before per-item complaints existed
              // only has the old single `complaint` field populated, not any related rows.
              <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.complaint}</p>
            )}
            {jobCard.diagnosis ? (
              <>
                <h2 className="mt-4 text-sm font-semibold text-[var(--ejo-text)]">Diagnosis</h2>
                <p className="mt-2 text-sm text-[var(--ejo-text)]">{jobCard.diagnosis}</p>
              </>
            ) : null}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Estimate</h2>
              {estimate ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    estimate.status === 'MANAGER_APPROVED'
                      ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                      : estimate.status === 'SUBMITTED' || estimate.status === 'APPROVED'
                        ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                        : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                  }`}
                >
                  {ESTIMATE_STATUS_LABEL[estimate.status]}
                </span>
              ) : null}
            </div>

            {jobCard.approvalStatus !== 'APPROVED' ? (
              <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">
                This Job Card must be approved by its supervisor before an estimate can be started.
              </p>
            ) : !estimate || estimate.lineItems.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No estimate lines yet.</p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Description</th>
                        <th className="py-2 pr-3 text-right font-medium">Qty</th>
                        <th className="py-2 pr-3 text-right font-medium">Unit Price</th>
                        <th className="py-2 pr-3 text-right font-medium">Amount</th>
                        <th className="py-2 pr-3 font-medium">Entered By</th>
                        {isEstimateContributor ? <th className="py-2 font-medium">&nbsp;</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.lineItems.map((item: (typeof estimate.lineItems)[number]) => {
                        const canModifyThis =
                          estimate.status !== 'MANAGER_APPROVED' && isEstimateContributor && (viewerId === item.enteredById || isApprover);
                        const isEditingThis = editLineId === item.id && canModifyThis;

                        if (isEditingThis) {
                          return (
                            <tr key={item.id} className="border-b border-[var(--ejo-border)] last:border-0">
                              <td colSpan={isEstimateContributor ? 7 : 6} className="py-2">
                                <form action={updateEstimateLineItemFormAction} className="flex flex-wrap items-center gap-2">
                                  <FormPendingOverlay />
                                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                                  <input type="hidden" name="lineItemId" value={item.id} />
                                  <span className="w-24 shrink-0 text-xs text-[var(--ejo-text-muted)]">{ESTIMATE_TYPE_LABEL[item.type]}</span>
                                  <input
                                    name="description"
                                    defaultValue={item.description}
                                    required
                                    list="internal-job-suggestions"
                                    className="min-w-[150px] flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                  />
                                  <input
                                    name="quantity"
                                    type="number"
                                    step="1"
                                    min="1"
                                    required
                                    defaultValue={item.quantity}
                                    className="w-16 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                  />
                                  <input
                                    name="unitPrice"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Unit Price"
                                    defaultValue={item.unitPrice != null ? Number(item.unitPrice) : ''}
                                    className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                  />
                                  <SubmitButton
                                    label="Save"
                                    pendingLabel="Saving…"
                                    className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                                  />
                                  <LoadingLink
                                    href={`/workshop/job-cards/${jobCard.id}`}
                                    className="text-xs text-[var(--ejo-text-muted)] hover:underline"
                                  >
                                    Cancel
                                  </LoadingLink>
                                </form>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={item.id} className="border-b border-[var(--ejo-border)] last:border-0">
                            <td className="py-2 pr-3 text-[var(--ejo-text-muted)]">{ESTIMATE_TYPE_LABEL[item.type]}</td>
                            <td className="py-2 pr-3 text-[var(--ejo-text)]">{item.description}</td>
                            <td className="py-2 pr-3 text-right text-[var(--ejo-text)]">{item.quantity}</td>
                            <td className="py-2 pr-3 text-right text-[var(--ejo-text)]">{formatNaira(item.unitPrice)}</td>
                            <td className="py-2 pr-3 text-right font-medium text-[var(--ejo-text)]">{formatNaira(item.amount)}</td>
                            <td className="py-2 pr-3 text-xs text-[var(--ejo-text-muted)]">{item.enteredBy.fullName}</td>
                            {isEstimateContributor ? (
                              <td className="py-2">
                                {canModifyThis ? (
                                  <div className="flex items-center gap-3">
                                    <LoadingLink
                                      href={`/workshop/job-cards/${jobCard.id}?editLineId=${item.id}`}
                                      className="inline-flex items-center text-xs font-medium leading-none text-[var(--ejo-primary)] hover:underline"
                                    >
                                      Edit
                                    </LoadingLink>
                                    <form action={deleteEstimateLineItemFormAction} className="inline-flex items-center">
                                      <FormPendingOverlay />
                                      <input type="hidden" name="jobCardId" value={jobCard.id} />
                                      <input type="hidden" name="lineItemId" value={item.id} />
                                      <button
                                        type="submit"
                                        className="inline-flex items-center text-xs font-medium leading-none text-[var(--ejo-error)] hover:underline"
                                      >
                                        Remove
                                      </button>
                                    </form>
                                  </div>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-1 border-t border-[var(--ejo-border)] pt-3 text-sm">
                  {(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const).map((type) => {
                    const subtotal = estimate.lineItems
                      .filter((item: (typeof estimate.lineItems)[number]) => item.type === type)
                      .reduce((sum: number, item: (typeof estimate.lineItems)[number]) => sum + Number(item.amount ?? 0), 0);
                    if (subtotal === 0) return null;
                    return (
                      <div key={type} className="flex justify-between text-[var(--ejo-text-muted)]">
                        <span>{ESTIMATE_TYPE_LABEL[type]} subtotal</span>
                        <span>{formatNaira(subtotal)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-base font-semibold text-[var(--ejo-text)]">
                    <span>Total Estimate</span>
                    <span>
                      {formatNaira(
                        estimate.lineItems.reduce(
                          (sum: number, item: (typeof estimate.lineItems)[number]) => sum + Number(item.amount ?? 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </>
            )}

            <datalist id="internal-job-suggestions">
              {COMMON_ESTIMATE_LINE_DESCRIPTIONS.map((d: string) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            {jobCard.approvalStatus === 'APPROVED' && isEstimateContributor && (!estimate || estimate.status === 'DRAFT') ? (
              <form action={addEstimateLineItemFormAction} className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--ejo-border)] pt-4 sm:grid-cols-5">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <select
                  name="type"
                  required
                  defaultValue="STORE_PART"
                  className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)] sm:col-span-1"
                >
                  <option value="STORE_PART">Store Part</option>
                  <option value="EXTERNAL_PART">External Part</option>
                  <option value="EXTERNAL_JOB">External Job</option>
                  <option value="INTERNAL_JOB">Internal Job</option>
                  <option value="LABOUR">Labour</option>
                  {!estimate?.lineItems.some((li: (typeof estimateLineItems)[number]) => li.type === 'SUNDRY') ? (
                    <option value="SUNDRY">Sundry</option>
                  ) : null}
                </select>
                <input
                  name="description"
                  required
                  list="internal-job-suggestions"
                  placeholder="Description"
                  className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)] sm:col-span-2"
                />
                <input
                  name="quantity"
                  type="number"
                  step="1"
                  min="1"
                  required
                  defaultValue="1"
                  placeholder="Qty"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                />
                <input
                  name="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Unit Price (optional)"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Add"
                  pendingLabel="Adding…"
                  className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:col-span-5"
                />
                <p className="col-span-2 text-[11px] text-[var(--ejo-text-muted)] sm:col-span-5">
                  Pricing: the technician prices External Part/Job lines (they sourced them); the supervisor
                  prices Store Part, Labour, and Sundry.
                </p>
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isAssignedTechnician ? (
              <form action={notifySupervisorAboutEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <div className="flex-1 min-w-[180px]">
                  <label className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify supervisor (optional note)</label>
                  <input
                    name="note"
                    placeholder="e.g. Compressor priced, ready to check"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                  />
                </div>
                <SubmitButton
                  label="Notify supervisor"
                  pendingLabel="Sending…"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                />
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isApprover ? (
              <form action={notifyTechnicianAboutEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <div className="flex-1 min-w-[180px]">
                  <label className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify technician (optional note)</label>
                  <input
                    name="note"
                    placeholder="e.g. Please add the AC compressor price"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                  />
                </div>
                <SubmitButton
                  label="Notify technician"
                  pendingLabel="Sending…"
                  className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                />
              </form>
            ) : null}

            {estimate?.status === 'DRAFT' && isEstimateContributor && estimate.lineItems.length > 0 ? (
              <form action={submitEstimateForValidationFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Every line needs a price before this can be submitted — a supervisor will validate it next.
                </p>
                <SubmitButton
                  label="Submit for validation"
                  pendingLabel="Submitting…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'SUBMITTED' && isApprover ? (
              <form action={approveEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Approve estimate"
                  pendingLabel="Approving…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'APPROVED' && isEligibleManager ? (
              <form action={approveEstimateAsManagerFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Approved by the supervisor — approving here notifies {jobCard.createdBy.fullName}, who created
                  this Job Card, to review and decide when to tell the customer.
                </p>
                <SubmitButton
                  label="Approve as Manager"
                  pendingLabel="Approving…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}

            {estimate?.status === 'MANAGER_APPROVED' && !estimate.customerNotifiedAt && isCreator ? (
              <form action={notifyCustomerOfApprovedEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                  Approved by the manager. Once you&apos;re satisfied everything is in order, notify the customer
                  so they can review the estimate and proceed.
                </p>
                <SubmitButton
                  label="Notify customer"
                  pendingLabel="Notifying…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}
            {estimate?.status === 'MANAGER_APPROVED' && estimate.customerNotifiedAt ? (
              <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                Customer notified on {formatDateTime(estimate.customerNotifiedAt)}.
              </p>
            ) : null}
          </div>

          {payments.length > 0 || jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Payments</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[paymentStatus]}`}>
                  {PAYMENT_STATUS_LABEL[paymentStatus]}
                </span>
              </div>
              {payments.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No payments recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  {payments.map((p: (typeof payments)[number]) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-[var(--ejo-border)] pb-2 last:border-0">
                      <div>
                        <p className="text-[var(--ejo-text)]">
                          {formatNaira(p.amount)} — {p.method === 'CASH' ? 'Cash' : 'Bank Transfer'}
                        </p>
                        <p className="text-xs text-[var(--ejo-text-muted)]">
                          {p.recordedBy.fullName} · {formatDateTime(p.recordedAt)}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 text-sm font-semibold text-[var(--ejo-text)]">
                    <span>Total Recorded</span>
                    <span>{formatNaira(paymentsTotal)}</span>
                  </div>
                  {estimateTotal > 0 && paymentsTotal < estimateTotal ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-warning)]">
                      <span>Balance Remaining</span>
                      <span>{formatNaira(estimateTotal - paymentsTotal)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {estimateTotal > 0 && paymentsTotal >= estimateTotal ? (
                <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs font-medium text-[var(--ejo-success)]">
                  Paid in full — nothing further to record.
                </p>
              ) : (jobCard.status === 'AWAITING_CUSTOMER_APPROVAL' || jobCard.status === 'IN_PROGRESS') && isEligibleFinance ? (
                <>
                  <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                    Recording is fully automatic — approval and the move to In Progress happen the moment the total
                    recorded first reaches the 70% minimum deposit, with no separate approval step. Pick a suggested
                    amount below, or choose &quot;Other&quot; to enter one manually — either way, whatever the field
                    shows is exactly what gets recorded.
                  </p>
                  <form key={payments.length} action={recordPaymentFormAction} className="mt-3 grid grid-cols-2 gap-2">
                    <input type="hidden" name="jobCardId" value={jobCard.id} />
                    <FormPendingOverlay />
                    <PaymentAmountField
                      options={
                        paymentsTotal > 0
                          ? [{ key: 'REMAINING', label: `Remaining balance (${formatNaira(estimateTotal - paymentsTotal)})`, value: (Math.round((estimateTotal - paymentsTotal) * 100) / 100).toFixed(2) }]
                          : [
                              { key: 'SEVENTY_PERCENT', label: `70% deposit (${formatNaira(minimumDeposit)})`, value: minimumDeposit.toFixed(2) },
                              { key: 'FULL', label: `Full payment (${formatNaira(estimateTotal)})`, value: estimateTotal.toFixed(2) },
                            ]
                      }
                    />
                    <select
                      name="method"
                      required
                      defaultValue="BANK_TRANSFER"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CASH">Cash</option>
                    </select>
                    <input
                      name="notes"
                      placeholder="Reference / notes (optional)"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                    />
                    <SubmitButton
                      label="Record payment"
                      pendingLabel="Recording…"
                      className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                    />
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {cancellationRequests.length > 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Cancellation history</h2>
              <div className="mt-3 space-y-3 text-sm">
                {cancellationRequests.map((r: (typeof cancellationRequests)[number]) => (
                  <div key={r.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          r.status === 'APPROVED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : r.status === 'DECLINED'
                              ? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                              : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                        }`}
                      >
                        {r.status === 'APPROVED' ? 'Approved' : r.status === 'DECLINED' ? 'Declined' : 'Awaiting Manager Decision'}
                      </span>
                      <span className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(r.requestedAt)}</span>
                    </div>
                    <p className="mt-1 text-[var(--ejo-text)]">{r.reason}</p>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Requested by {r.requestedBy.fullName}</p>
                    {r.decidedBy ? (
                      <p className="text-xs text-[var(--ejo-text-muted)]">
                        {r.status === 'APPROVED' ? 'Approved' : 'Declined'} by {r.decidedBy.fullName}
                        {r.decisionNotes ? ` — ${r.decisionNotes}` : ''}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-xs text-[var(--ejo-text-muted)]">
            Opened by {jobCard.createdBy.fullName} on {formatDateTime(jobCard.createdAt)}
            {jobCard.closedAt ? ` — closed ${formatDateTime(jobCard.closedAt)}` : null}
          </div>
        </div>

        <div className="space-y-6">
          {isCreator && !jobCard.supervisor ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Reassign supervisor</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {jobCard.approvalStatus === 'REJECTED'
                  ? `This Job Card was rejected${jobCard.rejectionReason ? ` — ${jobCard.rejectionReason}` : ''}. Route it to another eligible supervisor in the same department.`
                  : 'No supervisor is currently assigned. Choose one to route this Job Card to.'}
              </p>
              {eligibleSupervisors.supervisors.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--ejo-error)]">
                  No eligible supervisor or Master Administrator is currently active.
                </p>
              ) : (
                <form action={reassignSupervisorFormAction} className="mt-3 space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <select
                    name="supervisorId"
                    required
                    defaultValue=""
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  >
                    <option value="" disabled>Select a supervisor…</option>
                    {eligibleSupervisors.supervisors.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                  <SubmitButton
                    label="Reassign"
                    pendingLabel="Reassigning…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              )}
              {eligibleSupervisors.usingFallback ? (
                <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
                  No one is placed in this department as a Supervisor yet — showing Master Administrators as a
                  stand-in.
                </p>
              ) : null}
            </div>
          ) : null}

          {isApprover && jobCard.approvalStatus === 'PENDING' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Job Card</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approve to confirm this Job Card can proceed, or reject it back to {jobCard.createdBy.fullName} with
                a reason — a rejection doesn&apos;t have to mean something was wrong; availability or workload are
                valid reasons too.
              </p>
              <form action={approveJobCardFormAction} className="mt-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Approve"
                  pendingLabel="Approving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectJobCardFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejection (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional additional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Status</h2>
            {editStatus === 'true' ? (
              <form action={updateJobCardStatusFormAction} className="mt-4 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <select
                  name="status"
                  defaultValue={jobCard.status}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                >
                  {selectableStatuses.map((s) => (
                    <option key={s} value={s} style={s === 'CANCELLED' ? { color: 'var(--ejo-error)' } : undefined}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <SubmitButton
                    label="Update status"
                    pendingLabel="Updating…"
                    className="flex-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  />
                  <LoadingLink
                    href={`/workshop/job-cards/${jobCard.id}`}
                    className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  >
                    Cancel
                  </LoadingLink>
                </div>
              </form>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[jobCard.status]}`}>
                  {STATUS_LABEL[jobCard.status]}
                </span>
                <LoadingLink
                  href={`/workshop/job-cards/${jobCard.id}?editStatus=true`}
                  className="text-xs font-medium text-[var(--ejo-primary)] hover:underline"
                >
                  Edit
                </LoadingLink>
              </div>
            )}
          </div>

          {!isCancelled ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Assign technician</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Currently: {jobCard.assignedTechnician?.fullName ?? 'Unassigned'}
              </p>
              <form action={assignTechnicianFormAction} className="mt-4 space-y-3">
                <FormPendingOverlay />
              <input type="hidden" name="jobCardId" value={jobCard.id} />
              <select
                name="technicianId"
                defaultValue={jobCard.assignedTechnician?.id ?? ''}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="">— Unassigned —</option>
                {technicians.map((t: (typeof technicians)[number]) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                    {t.roles.length > 0 ? ` (${t.roles.map((r: (typeof t.roles)[number]) => r.role.name).join(', ')})` : ''}
                  </option>
                ))}
              </select>
              <SubmitButton
                label="Assign"
                pendingLabel="Assigning…"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              />
            </form>
          </div>
          ) : null}

          {!isCancelled && isAssignedTechnician && jobCard.technicianAcceptanceStatus === 'PENDING' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Respond to this assignment</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {jobCard.assignedTechnician?.fullName}, you&apos;ve been assigned to this Job Card. Accept to begin,
                or reject with a reason if you can&apos;t take it on.
              </p>
              <form action={acceptTechnicianAssignmentFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <SubmitButton
                  label="Accept"
                  pendingLabel="Accepting…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectTechnicianAssignmentFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejecting (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {pendingCancellationRequest && isEligibleManager ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Cancellation requested</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {pendingCancellationRequest.requestedBy.fullName}: {pendingCancellationRequest.reason}
              </p>
              <div className="mt-3 space-y-2">
                <form action={approveCancellationRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCancellationRequest.id} />
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Approve cancellation"
                    pendingLabel="Approving…"
                    className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  />
                </form>
                <form action={declineCancellationRequestFormAction} className="space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCard.id} />
                  <input type="hidden" name="requestId" value={pendingCancellationRequest.id} />
                  <input
                    name="decisionNotes"
                    placeholder="Note (optional)"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                  />
                  <SubmitButton
                    label="Decline"
                    pendingLabel="Declining…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              </div>
            </div>
          ) : !pendingCancellationRequest && canRequestCancellation && jobCard.status !== 'CANCELLED' && jobCard.status !== 'CLOSED' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Request cancellation</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                For a customer who called, emailed, or came in — requires Manager approval before this Job Card
                is actually cancelled.
              </p>
              <form action={requestJobCardCancellationFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <textarea
                  name="reason"
                  required
                  rows={2}
                  placeholder="Reason — e.g. customer called to cancel, could not afford repair"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Request cancellation"
                  pendingLabel="Requesting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {isMasterAdmin ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Danger zone</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Permanently deletes this Job Card and its complaints. This cannot be undone.
              </p>
              <form action={deleteJobCardFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={jobCard.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Delete Job Card ${jobCard.jobNumber}? This permanently removes it and its complaints. This cannot be undone.`}
                  label="Delete this Job Card"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
        {auditTrail.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {auditTrail.map((entry) => {
              const detail = formatAuditDetail(entry);
              return (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" />
                  <div>
                    <p className="text-[var(--ejo-text)]">
                      <span className="font-medium">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</span>
                      {entry.user ? ` — ${entry.user.fullName}` : ''}
                    </p>
                    {detail ? <p className="text-xs text-[var(--ejo-text)]">{detail}</p> : null}
                    <p className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
