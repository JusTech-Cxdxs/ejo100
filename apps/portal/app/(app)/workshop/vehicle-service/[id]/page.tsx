import { notFound } from 'next/navigation';
import { getVehicleService, getVehicleServiceAuditTrail } from '@/lib/actions/vehicle-service';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getServiceEstimate } from '@/lib/actions/vehicle-service-estimate';
import { cancelVehicleInspectionFormAction, completeVehicleInspectionFromServicePageFormAction } from '@/lib/actions/vehicle-inspection-form-handlers';
import {
  createServiceEstimateFormAction,
  cancelServiceEstimateFormAction,
  removeServiceEstimateLineItemFormAction,
  updateServiceEstimateLineItemFormAction,
  submitServiceEstimateFormAction,
  approveServiceEstimateFormAction,
  approveServiceEstimateAsManagerFormAction,
  notifyCustomerOfApprovedServiceEstimateFormAction,
  notifySupervisorAboutServiceEstimateFormAction,
  notifyTechnicianAboutServiceEstimateFormAction,
  requestServiceEstimateStoreMatchingFormAction,
} from '@/lib/actions/vehicle-service-estimate-form-handlers';
import { requestServiceEstimatePartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { getVehicleServiceSourcingNeeds } from '@/lib/actions/sourcing';
import { getVehicleServicePayments } from '@/lib/actions/vehicle-service-payment';
import { recordServicePaymentFormAction } from '@/lib/actions/vehicle-service-payment-form-handlers';
import { listTechnicianCandidates, currentUserIsMasterAdmin, currentUserId, listEligibleFinanceOfficersForBranch, listEligibleManagersForBranch } from '@/lib/actions/workshop';
import { listPartTypes, listPartCategories } from '@/lib/actions/store';
import {
  updateVehicleServiceStatusFormAction,
  escalateVehicleServiceFormAction,
  approveVehicleServiceFormAction,
  rejectVehicleServiceFormAction,
  assignTechnicianToVehicleServiceFormAction,
  acceptVehicleServiceTechnicianAssignmentFormAction,
  rejectVehicleServiceTechnicianAssignmentFormAction,
  deleteVehicleServiceFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { PaymentAmountField } from '@/components/PaymentAmountField';
import { MINIMUM_DEPOSIT_FRACTION, COMMON_ESTIMATE_LINE_DESCRIPTIONS } from '@/lib/workshop-constants';
import { ServiceEstimateLineItemForm } from '@/components/ServiceEstimateLineItemForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupervisorPicker } from '@/components/SupervisorPicker';
import { AuditTrail } from '@/components/AuditTrail';
import { PrintMenu } from '@/components/print/PrintMenu';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { UnitOfMeasureInput } from '@/components/UnitOfMeasureInput';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
};
const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  CHECKED_IN: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  IN_SERVICE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  COLLECTED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

const PART_REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
  PENDING_STORE_APPROVAL: 'Awaiting Store approval',
  APPROVED: 'Approved — awaiting release',
  RELEASED: 'Released',
  REJECTED: 'Rejected',
};

const PART_REQUEST_STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING_HOD_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  PENDING_STORE_APPROVAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  APPROVED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RELEASED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

const SERVICE_ESTIMATE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting supervisor validation',
  APPROVED: 'Awaiting manager review',
  MANAGER_APPROVED: 'Approved',
};

const SERVICE_ESTIMATE_LINE_TYPE_DISPLAY: Record<string, string> = {
  STORE_PART: 'Store Part',
  INTERNAL_JOB: 'Internal Job',
  LABOUR: 'Labour',
  SUNDRY: 'Sundry',
};

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  SCHEDULED: { status: 'CHECKED_IN', label: 'Check In Vehicle' },
  // No manual path to IN_SERVICE — every real Vehicle Service goes
  // through the real choice (Continue with Normal Service or
  // Escalate) after inspection. Choosing Continue means writing a
  // real estimate; once that's approved, the 70% deposit is what
  // actually moves this to In Service (see recordServicePayment),
  // never a manual click. There's no such thing as a free visit with
  // nothing to estimate and nothing to pay for.
  CHECKED_IN: null,
  IN_SERVICE: { status: 'COMPLETED', label: 'Complete Service' },
  COMPLETED: { status: 'COLLECTED', label: 'Mark Collected' },
  COLLECTED: null,
  CANCELLED: null,
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'vehicle_service.created': 'Vehicle Service opened',
  'vehicle_service.approved': 'Vehicle Service approved',
  'vehicle_service.rejected': 'Vehicle Service rejected',
  'vehicle_service.status_updated': 'Status updated',
  'vehicle_service.technician_assigned': 'Technician assigned',
  'vehicle_service.escalated_to_job_card': 'Escalated to Job Card',
  'vehicle_service.attended_to': 'Overdue prediction attended to',
  'assignment.accepted': 'Technician accepted assignment',
  'assignment.rejected': 'Technician rejected assignment',
  'vehicle_inspection.started': 'Inspection started',
  'vehicle_inspection.skipped': 'Inspection skipped',
  'vehicle_inspection.cancelled': 'Inspection cancelled',
  'vehicle_inspection.items_updated': 'Inspection items updated',
  'vehicle_inspection.completed': 'Inspection completed',
  'service_estimate.created': 'Estimate started',
  'service_estimate.line_item_added': 'Estimate line added',
  'service_estimate.line_item_removed': 'Estimate line removed',
  'service_estimate.line_item_updated': 'Estimate line updated',
  'service_estimate.line_store_matched': 'Estimate line matched to Store Part',
  'service_estimate.store_matching_requested': 'Store matching requested',
  'service_estimate.store_matching_completed': 'Store matching completed',
  'service_estimate.nudge_to_supervisor': 'Technician notified supervisor',
  'service_estimate.nudge_to_technician': 'Supervisor notified technician',
  'service_estimate.submitted': 'Estimate submitted for approval',
  'service_estimate.approved': 'Estimate approved',
  'service_estimate.manager_approved': 'Estimate approved by manager',
  'service_estimate.customer_notified': 'Customer notified of approved estimate',
  'service_estimate.cancelled': 'Estimate cancelled',
  'part_request_slip.requested': 'Parts requested from Store',
  'part_request_slip.hod_approved': 'Parts request approved by HOD',
  'part_request_slip.store_approved': 'Parts request approved by Store',
  'part_request_slip.released': 'Parts released',
  'part_request_slip.rejected': 'Parts request rejected',
  'payment.recorded': 'Payment recorded',
  'payment.approved': 'Deposit requirement met — work started',
};

// Prisma returns Decimal fields as Decimal objects (from decimal.js),
// not plain numbers — Number(...) here is a deliberate, safe
// conversion, matching Job Card's own module-level formatNaira exactly.
function formatNaira(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  switch (entry.action) {
    case 'vehicle_service.rejected':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'vehicle_service.status_updated':
      return typeof meta.from === 'string' && typeof meta.to === 'string'
        ? `${STATUS_LABEL[meta.from] ?? meta.from} → ${STATUS_LABEL[meta.to] ?? meta.to}`
        : null;
    case 'vehicle_service.technician_assigned':
      return typeof meta.technicianName === 'string' ? meta.technicianName : null;
    case 'vehicle_inspection.skipped':
    case 'vehicle_inspection.cancelled':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'vehicle_service.escalated_to_job_card':
      return typeof meta.jobNumber === 'string' ? `New Job Card: ${meta.jobNumber}` : null;
    // Same real detail-building logic as Job Card's own
    // formatAuditDetail — one real place a technician, supervisor or
    // Master Admin can see exactly what changed on this estimate and
    // who did it, not just that "something" happened.
    case 'service_estimate.line_item_added':
    case 'service_estimate.line_item_updated': {
      const parts: string[] = [];
      if (typeof meta.type === 'string') parts.push(SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[meta.type] ?? meta.type);
      if (typeof meta.description === 'string') parts.push(`"${meta.description}"`);
      if (typeof meta.quantity === 'number') parts.push(`qty ${meta.quantity}`);
      if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
      else parts.push('no price set');
      return parts.join(' — ');
    }
    case 'service_estimate.line_item_removed':
      return typeof meta.description === 'string' ? `"${meta.description}"` : null;
    case 'service_estimate.line_store_matched': {
      const parts: string[] = [];
      if (typeof meta.partName === 'string') parts.push(`matched to "${meta.partName}"`);
      if (typeof meta.unitPrice === 'number') parts.push(`priced at ${formatNaira(meta.unitPrice)}`);
      return parts.length > 0 ? parts.join(' — ') : null;
    }
    case 'service_estimate.store_matching_requested':
    case 'service_estimate.store_matching_completed':
    case 'service_estimate.nudge_to_supervisor':
    case 'service_estimate.nudge_to_technician':
      return typeof meta.note === 'string' && meta.note ? `Note: ${meta.note}` : typeof meta.notes === 'string' && meta.notes ? `Note: ${meta.notes}` : null;
    case 'payment.recorded': {
      const parts: string[] = [];
      if (typeof meta.amount === 'number') parts.push(formatNaira(meta.amount));
      if (typeof meta.method === 'string') parts.push(meta.method === 'CASH' ? 'Cash' : 'Bank Transfer');
      if (typeof meta.notes === 'string' && meta.notes) parts.push(meta.notes);
      return parts.join(' — ') || null;
    }
    case 'payment.approved':
      return typeof meta.totalPaid === 'number' ? `Total confirmed: ${formatNaira(meta.totalPaid)}` : null;
    case 'part_request_slip.requested': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      if (typeof meta.lineCount === 'number') parts.push(pluralize(meta.lineCount, 'line'));
      return parts.join(' — ') || null;
    }
    case 'part_request_slip.hod_approved':
    case 'part_request_slip.store_approved':
      return typeof meta.referenceNumber === 'string' ? meta.referenceNumber : null;
    case 'part_request_slip.released': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      const collectedByName = typeof meta.receivedByName === 'string' ? meta.receivedByName : null;
      if (collectedByName) parts.push(`Collected by ${collectedByName}`);
      return parts.join(' — ') || null;
    }
    case 'part_request_slip.rejected': {
      const parts: string[] = [];
      if (typeof meta.referenceNumber === 'string') parts.push(meta.referenceNumber);
      if (typeof meta.stage === 'string') parts.push(`at ${meta.stage}`);
      if (typeof meta.reason === 'string') parts.push(`Reason: ${meta.reason}`);
      return parts.join(' — ') || null;
    }
    default:
      return typeof meta.notes === 'string' && meta.notes ? `Notes: ${meta.notes}` : null;
  }
}

export default async function VehicleServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editMileage?: string; editLineId?: string; error?: string; status?: string }>;
}) {
  const { editMileage, editLineId, error, status } = await searchParams;
  const { id } = await params;
  const [service, isMasterAdmin, viewerId] = await Promise.all([
    getVehicleService(id),
    currentUserIsMasterAdmin(),
    currentUserId(),
  ]);
  if (!service) notFound();

  const isApprover = isMasterAdmin || service.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || service.assignedTechnician?.id === viewerId;
  const isEstimateContributor = isMasterAdmin || service.supervisor?.id === viewerId || service.assignedTechnician?.id === viewerId;
  const nextAction = NEXT_ACTION[service.status];
  const canCancel = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const [technicians, auditTrail, inspection, serviceEstimate, partTypes, partCategories, payments, eligibleFinance, eligibleManagers, sourcingNeeds] = await Promise.all([
    listTechnicianCandidates(),
    getVehicleServiceAuditTrail(id),
    getVehicleInspection(id),
    getServiceEstimate(id),
    listPartTypes(service.branchId),
    listPartCategories(service.branchId),
    getVehicleServicePayments(id),
    listEligibleFinanceOfficersForBranch(service.branchId),
    listEligibleManagersForBranch(service.branchId),
    getVehicleServiceSourcingNeeds(id),
  ]);
  const partCategoriesWithTypes = partCategories.map((category: (typeof partCategories)[number]) => ({
    id: category.id,
    name: category.name,
    types: partTypes.filter((t: (typeof partTypes)[number]) => t.categoryId === category.id).map((t: (typeof partTypes)[number]) => ({ id: t.id, name: t.name, typicalUnit: t.typicalUnit })),
  }));
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  // Same real rule as Job Card's own isCreator — whoever created this
  // Vehicle Service itself (matching notifyCustomerOfApprovedServiceEstimate's
  // own backend check), not whoever happened to start the estimate.
  const isEstimateCreator = isMasterAdmin || service.createdBy.id === viewerId;
  const hasUnmatchedStoreParts = serviceEstimate?.lineItems.some((li: { type: string; matchedPartId: string | null }) => li.type === 'STORE_PART' && !li.matchedPartId) ?? false;
  // Same real "live while still Draft" price as Job Card's own
  // getLiveLineAmount — a matched Store Part line always reflects the
  // Part's own current real price for as long as the estimate can
  // still be edited, never a stale snapshot.
  function getLiveLineAmount(item: { type: string; quantity: unknown; amount: unknown; matchedPart: { sellingPrice: unknown } | null }): number {
    if (item.type === 'STORE_PART' && item.matchedPart && serviceEstimate?.status === 'DRAFT' && item.matchedPart.sellingPrice !== null) {
      return Math.round(Number(item.quantity) * Number(item.matchedPart.sellingPrice) * 100) / 100;
    }
    return item.amount !== null ? Number(item.amount) : 0;
  }
  const estimateTotal = (serviceEstimate?.lineItems ?? []).reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const paymentsTotal = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount ?? 0), 0);
  const minimumDeposit = Math.round(estimateTotal * MINIMUM_DEPOSIT_FRACTION * 100) / 100;

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop/vehicle-service"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service
      </LoadingLink>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'inspection_cancelled' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection cancelled." />
        </div>
      ) : null}
      {status === 'estimate_started' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Service Estimate started." />
        </div>
      ) : null}
      {status === 'estimate_cancelled' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Estimate cancelled — you can now escalate to a Job Card instead." />
        </div>
      ) : null}
      {status === 'line_added' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Line item added." />
        </div>
      ) : null}
      {status === 'line_removed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Line item removed." />
        </div>
      ) : null}
      {status === 'line_updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Line item updated." />
        </div>
      ) : null}
      {status === 'supervisor_notified' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Supervisor notified." />
        </div>
      ) : null}
      {status === 'technician_notified' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Technician notified." />
        </div>
      ) : null}
      {status === 'matching_requested' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Store matching requested." />
        </div>
      ) : null}
      {status === 'estimate_manager_approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Estimate approved as manager." />
        </div>
      ) : null}
      {status === 'customer_notified' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Customer notified." />
        </div>
      ) : null}
      {status === 'line_matched' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Matched to a real Part." />
        </div>
      ) : null}
      {status === 'estimate_submitted' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Estimate submitted." />
        </div>
      ) : null}
      {status === 'estimate_approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Estimate approved." />
        </div>
      ) : null}
      {status === 'assignment_accepted' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Assignment accepted." />
        </div>
      ) : null}
      {status === 'assignment_rejected' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Assignment rejected." />
        </div>
      ) : null}
      {status === 'parts_requested' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Store Parts Request raised." />
        </div>
      ) : null}
      {status === 'payment_recorded' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Payment recorded." />
        </div>
      ) : null}
      {status === 'inspection_completed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection completed." />
        </div>
      ) : null}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{service.serviceNumber}</h1>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              service.escalatedToJobCard ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : STATUS_CLASS[service.status]
            }`}
          >
            {service.escalatedToJobCard ? 'Escalated' : STATUS_LABEL[service.status]}
          </span>
        </div>
      </div>

      {service.escalatedToJobCard ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-4 text-sm">
          A repair beyond routine maintenance was found — this visit was sent to{' '}
          <LoadingLink href={`/workshop/job-cards/${service.escalatedToJobCard.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            Job Card {service.escalatedToJobCard.jobNumber}
          </LoadingLink>
          , which now handles the repair.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer &amp; Vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.customer.fullName}
                  {service.customer.customerType === 'ORGANIZATION' ? (
                    <span className="ml-2 rounded-full bg-[var(--ejo-info)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-info)]">
                      Organization
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                      Individual
                    </span>
                  )}
                </dd>
              </div>
              {service.customer.address ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Address</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.customer.address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Contact</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.customer.phone || service.customer.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  <LoadingLink href={`/workshop/vehicles/${service.vehicle.id}/edit`} className="hover:underline">
                    {[service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || '—'}
                  </LoadingLink>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Plate</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.vehicle.plateNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-[var(--ejo-text)]">{service.vehicle.chassisNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.odometerAtService != null ? `${service.odometerAtService.toLocaleString('en-NG')} km` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Workshop department</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.department?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Supervisor</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.supervisor?.fullName ?? 'Unassigned'}
                  {service.supervisor ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        service.approvalStatus === 'APPROVED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : service.approvalStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {service.approvalStatus === 'APPROVED' ? 'Approved' : service.approvalStatus === 'REJECTED' ? 'Rejected' : 'Awaiting approval'}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.assignedTechnician?.fullName ?? 'Unassigned'}
                  {service.technicianAcceptanceStatus ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        service.technicianAcceptanceStatus === 'ACCEPTED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : service.technicianAcceptanceStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {service.technicianAcceptanceStatus === 'ACCEPTED'
                        ? 'Accepted'
                        : service.technicianAcceptanceStatus === 'REJECTED'
                          ? `Rejected — ${service.technicianRejectionReason}`
                          : 'Awaiting response'}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            {service.complaints.length > 0 ? (
              <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(service.complaints.length, "Customer's Request")}</p>
                <div className="mt-1 space-y-1">
                  {service.complaints.map((c: (typeof service.complaints)[number]) => (
                    <p key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                      <span className="text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span> {c.description}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {(() => {
              const findings = (inspection?.items ?? []).filter((i: { severity: string | null }) => i.severity && i.severity !== 'GOOD');
              return findings.length > 0 ? (
                <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                  <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(findings.length, 'Inspection Finding')}</p>
                  <div className="mt-1 space-y-1">
                    {findings.map((i: { section: string; name: string; severity: string | null; action: string | null }, idx: number) => (
                      <p key={idx} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                        <span className="text-[var(--ejo-text-muted)]">{idx + 1}.</span>
                        <span>
                          <span className="font-medium">{i.section} — {i.name}</span>
                          {i.action ? `: ${i.action}` : ''}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle Inspection</h2>
              {inspection?.status === 'IN_PROGRESS' || inspection?.status === 'COMPLETED' ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${inspection.status === 'COMPLETED' ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'}`}>
                  {inspection.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                </span>
              ) : inspection?.status === 'SKIPPED' ? (
                <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-text-muted)]">Skipped</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              The real technical record of what the supervisor/technician actually found on this vehicle.
            </p>
            {!inspection ? (
              <LoadingLink
                href={`/workshop/vehicle-service/${service.id}/inspection`}
                className="mt-3 inline-block rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              >
                Open Inspection
              </LoadingLink>
            ) : inspection.status === 'SKIPPED' ? (
              <>
                {inspection.skipReason ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Reason: {inspection.skipReason}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={cancelVehicleInspectionFormAction}>
                    <FormPendingOverlay />
                    <input type="hidden" name="vehicleServiceId" value={service.id} />
                    <input type="hidden" name="redirectTo" value={`/workshop/vehicle-service/${service.id}/inspection`} />
                    <SubmitButton
                      label="Reopen — Inspect or Skip Again"
                      pendingLabel="Reopening…"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                    />
                  </form>
                </div>
              </>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <LoadingLink
                  href={`/workshop/vehicle-service/${service.id}/inspection`}
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  View Inspection
                </LoadingLink>
                {inspection.status === 'IN_PROGRESS' ? (
                  <form action={completeVehicleInspectionFromServicePageFormAction}>
                    <FormPendingOverlay />
                    <input type="hidden" name="inspectionId" value={inspection.id} />
                    <input type="hidden" name="vehicleServiceId" value={service.id} />
                    <SubmitButton
                      label="Complete"
                      pendingLabel="Completing…"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-success)] hover:bg-[var(--ejo-success)]/10"
                    />
                  </form>
                ) : null}
                <PrintMenu
                  orgHref={`/print/vehicle-inspections/${service.id}`}
                  clientHref={`/print/vehicle-inspections/${service.id}?variant=client`}
                  clientLabel="Customer Copy"
                  size="compact"
                />
                <form action={cancelVehicleInspectionFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="vehicleServiceId" value={service.id} />
                  <input type="hidden" name="redirectTo" value={`/workshop/vehicle-service/${service.id}`} />
                  <SubmitButton
                    label="Cancel Inspection"
                    pendingLabel="Cancelling…"
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                  />
                </form>
              </div>
            )}
          </div>

          {!service.escalatedToJobCard && inspection && inspection.status !== 'IN_PROGRESS' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
                  {serviceEstimate ? 'Service Estimate' : 'What happens next?'}
                </h2>
                {serviceEstimate ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      serviceEstimate.status === 'MANAGER_APPROVED'
                        ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                        : serviceEstimate.status === 'SUBMITTED' || serviceEstimate.status === 'APPROVED'
                          ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                          : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                    }`}
                  >
                    {SERVICE_ESTIMATE_STATUS_LABEL[serviceEstimate.status] ?? serviceEstimate.status}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {serviceEstimate
                  ? "For routine work that doesn't need a Job Card — engine oil, filters, and other items the customer still needs priced and approved."
                  : 'Choose one — a real repair beyond routine service should escalate to a Job Card; routine work continues here with its own estimate.'}
              </p>

              {!serviceEstimate ? (
                <>
                  <form action={createServiceEstimateFormAction} className="mt-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="vehicleServiceId" value={service.id} />
                    <SubmitButton
                      label="Continue with Normal Service"
                      pendingLabel="Starting…"
                      className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    />
                  </form>

                  <div className="mt-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-4">
                    <h3 className="text-sm font-semibold text-[var(--ejo-error)]">Or escalate — real repair work</h3>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                      Beyond routine maintenance? This opens a real Job Card for this vehicle — that&apos;s
                      where the estimate is actually built, approved, and worked from.
                    </p>
                    {(() => {
                      const findings = (inspection?.items ?? []).filter(
                        (i: { severity: string | null }) => i.severity === 'ATTENTION' || i.severity === 'SERVICE_REQUIRED' || i.severity === 'CRITICAL',
                      );
                      return findings.length > 0 ? (
                        <p className="mt-2 text-xs text-[var(--ejo-text)]">
                          <span className="font-medium">{findings.length}</span> inspection finding{findings.length === 1 ? '' : 's'} will carry
                          straight into the new Job Card as real complaint lines — nothing needs retyping.
                        </p>
                      ) : null;
                    })()}
                    <form action={escalateVehicleServiceFormAction} className="mt-3 space-y-3">
                      <FormPendingOverlay />
                      <input type="hidden" name="serviceId" value={service.id} />
                      <SupervisorPicker vehicleType={service.vehicle.vehicleType} defaultSupervisorId={service.supervisor?.id} />
                      <textarea
                        name="additionalComplaint"
                        rows={2}
                        placeholder="Anything else worth adding…"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                      <SubmitButton
                        label="Create Job Card & Estimate"
                        pendingLabel="Creating…"
                        className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  </div>
                </>
              ) : serviceEstimate.status !== 'MANAGER_APPROVED' ? (
                <form action={cancelServiceEstimateFormAction} className="mt-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="vehicleServiceId" value={service.id} />
                  <SubmitButton
                    label="Cancel — Escalate to Job Card Instead"
                    pendingLabel="Cancelling…"
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              ) : null}

              {serviceEstimate ? (
                <>
                  {serviceEstimate.lineItems.length > 0 ? (
                    <table className="mt-4 w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                          <th className="py-1.5 pr-2 font-medium">Type</th>
                          <th className="py-1.5 pr-2 font-medium">Description</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                          <th className="py-1.5 pr-2 font-medium">Unit</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Unit Price</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Amount</th>
                          <th className="py-1.5 pr-2 font-medium">Entered By</th>
                          {isEstimateContributor ? <th className="py-1.5 font-medium">&nbsp;</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {serviceEstimate.lineItems.map((line: (typeof serviceEstimate.lineItems)[number]) => {
                          const canModifyThis = serviceEstimate.status !== 'MANAGER_APPROVED' && isEstimateContributor && (viewerId === line.enteredById || isApprover);
                          const isEditingThis = editLineId === line.id && canModifyThis;
                          const needsMatch = line.type === 'STORE_PART' && !line.matchedPartId;
                          // Same real preview purpose as Job Card's own
                          // table — a genuine, non-binding look at what
                          // the unit will actually be, never a value
                          // that's itself submitted anywhere.
                          const storePartPreviewUnit =
                            line.type === 'STORE_PART'
                              ? (line.unitOfMeasure ?? partTypes.find((t: (typeof partTypes)[number]) => t.id === line.partTypeId)?.typicalUnit ?? null)
                              : null;
                          const rawUnit = line.type === 'STORE_PART' ? storePartPreviewUnit : line.unitOfMeasure;
                          const displayUnit = rawUnit ? pluralizeWord(Number(line.quantity), rawUnit) : '—';
                          // Same real "live while still Draft" price
                          // tracking as Job Card's own table — a
                          // matched Store Part line always shows the
                          // Part's own current real selling price
                          // while the estimate can still be edited at
                          // all, never a stale snapshot from the
                          // moment it happened to be matched.
                          const liveUnitPrice =
                            line.type === 'STORE_PART' && line.matchedPart && serviceEstimate.status === 'DRAFT' && line.matchedPart.sellingPrice !== null
                              ? Number(line.matchedPart.sellingPrice)
                              : line.unitPrice != null
                                ? Number(line.unitPrice)
                                : null;
                          const liveAmount = liveUnitPrice != null ? Math.round(Number(line.quantity) * liveUnitPrice * 100) / 100 : null;

                          if (isEditingThis) {
                            return (
                              <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                                <td colSpan={isEstimateContributor ? 8 : 7} className="py-2">
                                  <form action={updateServiceEstimateLineItemFormAction} className="flex flex-wrap items-center gap-2">
                                    <FormPendingOverlay />
                                    <input type="hidden" name="vehicleServiceId" value={service.id} />
                                    <input type="hidden" name="lineItemId" value={line.id} />
                                    <span className="w-24 shrink-0 text-xs text-[var(--ejo-text-muted)]">{SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[line.type] ?? line.type}</span>
                                    <input
                                      name="description"
                                      defaultValue={line.description}
                                      required
                                      list="service-estimate-line-suggestions"
                                      className="min-w-[120px] flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                    />
                                    <input
                                      name="quantity"
                                      type="number"
                                      step="1"
                                      min="1"
                                      required
                                      defaultValue={Number(line.quantity)}
                                      className="w-16 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                    />
                                    {line.type === 'STORE_PART' ? (
                                      <span className="w-24 shrink-0 text-xs text-[var(--ejo-text)]">
                                        {storePartPreviewUnit ?? <span className="text-[11px] text-[var(--ejo-text-muted)]">Awaiting Store match</span>}
                                      </span>
                                    ) : (
                                      <div className="w-24 shrink-0">
                                        <UnitOfMeasureInput name="unitOfMeasure" defaultValue={line.unitOfMeasure ?? undefined} placeholder="Unit" />
                                      </div>
                                    )}
                                    {line.type !== 'STORE_PART' ? (
                                      <input
                                        name="unitPrice"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Unit Price"
                                        defaultValue={line.unitPrice != null ? Number(line.unitPrice) : ''}
                                        className="w-24 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                                      />
                                    ) : null}
                                    <SubmitButton
                                      label="Save"
                                      pendingLabel="Saving…"
                                      className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                                    />
                                    <LoadingLink href={`/workshop/vehicle-service/${service.id}`} className="text-xs text-[var(--ejo-text-muted)] hover:underline">
                                      Cancel
                                    </LoadingLink>
                                  </form>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[line.type] ?? line.type}</td>
                              <td className="py-1.5 pr-2 break-words text-[var(--ejo-text)]">
                                {line.description}
                                {line.type === 'STORE_PART' ? (
                                  line.matchedPart ? (
                                    <div className="mt-0.5 text-[10px] text-[var(--ejo-success)]">Matched: {line.matchedPart.name}</div>
                                  ) : (
                                    <div className="mt-0.5 text-[10px] text-[var(--ejo-warning)]">Awaiting Store match</div>
                                  )
                                ) : null}
                              </td>
                              <td className="py-1.5 pr-2 text-right text-[var(--ejo-text)]">{Number(line.quantity)}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{displayUnit}</td>
                              <td className="py-1.5 pr-2 text-right text-[var(--ejo-text-muted)]">
                                {liveUnitPrice != null ? `₦${liveUnitPrice.toLocaleString('en-NG')}` : needsMatch ? 'Awaiting match' : '—'}
                                {line.type === 'STORE_PART' && line.matchedPart && serviceEstimate.status === 'DRAFT' ? (
                                  <span className="ml-1 text-[9px] font-medium uppercase text-[var(--ejo-success)]">live</span>
                                ) : null}
                              </td>
                              <td className="py-1.5 pr-2 text-right font-medium text-[var(--ejo-text)]">{liveAmount != null ? `₦${liveAmount.toLocaleString('en-NG')}` : '—'}</td>
                              <td className="py-1.5 pr-2 truncate text-[11px] text-[var(--ejo-text-muted)]">{line.enteredBy.fullName}</td>
                              {isEstimateContributor ? (
                                <td className="py-1.5">
                                  {canModifyThis ? (
                                    <div className="flex items-center gap-3">
                                      <LoadingLink href={`/workshop/vehicle-service/${service.id}?editLineId=${line.id}`} className="inline-flex items-center text-xs font-medium leading-none text-[var(--ejo-primary)] hover:underline">
                                        Edit
                                      </LoadingLink>
                                      <form action={removeServiceEstimateLineItemFormAction} className="inline-flex items-center">
                                        <FormPendingOverlay />
                                        <input type="hidden" name="lineItemId" value={line.id} />
                                        <input type="hidden" name="vehicleServiceId" value={service.id} />
                                        <button type="submit" className="inline-flex items-center text-xs font-medium leading-none text-[var(--ejo-error)] hover:underline">
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
                  ) : (
                    <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">No line items yet.</p>
                  )}

                  {serviceEstimate.lineItems.length > 0 ? (
                    <div className="mt-3 space-y-1 border-t border-[var(--ejo-border)] pt-3 text-sm">
                      {(['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const).map((type) => {
                        const subtotal = serviceEstimate.lineItems
                          .filter((item: (typeof serviceEstimate.lineItems)[number]) => item.type === type)
                          .reduce((sum: number, item: (typeof serviceEstimate.lineItems)[number]) => sum + getLiveLineAmount(item), 0);
                        if (subtotal === 0) return null;
                        return (
                          <div key={type} className="flex justify-between text-[var(--ejo-text-muted)]">
                            <span>{SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[type]} subtotal</span>
                            <span>{formatNaira(subtotal)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between text-base font-semibold text-[var(--ejo-text)]">
                        <span>Total Estimate</span>
                        <span>
                          {formatNaira(
                            serviceEstimate.lineItems.reduce(
                              (sum: number, item: (typeof serviceEstimate.lineItems)[number]) => sum + getLiveLineAmount(item),
                              0,
                            ),
                          )}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {serviceEstimate.status === 'DRAFT' ? (
                    <ServiceEstimateLineItemForm
                      vehicleServiceId={service.id}
                      estimateId={serviceEstimate.id}
                      categories={partCategoriesWithTypes}
                      descriptionSuggestions={COMMON_ESTIMATE_LINE_DESCRIPTIONS}
                      hasSundry={Boolean(serviceEstimate.lineItems.some((li: (typeof serviceEstimate.lineItems)[number]) => li.type === 'SUNDRY'))}
                      isTechnicianOnly={isAssignedTechnician && !isApprover}
                    />
                  ) : null}

                  {serviceEstimate.status === 'DRAFT' && isAssignedTechnician ? (
                    <form action={notifySupervisorAboutServiceEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify supervisor (optional note)</label>
                        <input
                          name="note"
                          placeholder="e.g. Parts priced, ready to check"
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

                  {serviceEstimate.status === 'DRAFT' && isApprover ? (
                    <form action={notifyTechnicianAboutServiceEstimateFormAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-[11px] text-[var(--ejo-text-muted)]">Notify technician (optional note)</label>
                        <input
                          name="note"
                          placeholder="e.g. Please add the pricing"
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

                  {serviceEstimate.status === 'DRAFT' && isEstimateContributor && serviceEstimate.lineItems.length > 0 && hasUnmatchedStoreParts ? (
                    <form action={requestServiceEstimateStoreMatchingFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                        {serviceEstimate.matchingRequestedAt
                          ? 'Store matching already requested — awaiting Store. Submission stays on hold until every Store Part line is matched.'
                          : 'This estimate has Store Part lines with no price yet — those only get priced once Store matches them. Request Store matching to move forward.'}
                      </p>
                      <SubmitButton
                        label={serviceEstimate.matchingRequestedAt ? 'Request Store Matching Again' : 'Request Store Matching'}
                        pendingLabel="Sending…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : null}

                  {serviceEstimate.status === 'DRAFT' && isEstimateContributor && serviceEstimate.lineItems.length > 0 && !hasUnmatchedStoreParts ? (
                    <form action={submitServiceEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
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

                  {serviceEstimate.status === 'SUBMITTED' && isApprover ? (
                    <form action={approveServiceEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <SubmitButton
                        label="Approve estimate"
                        pendingLabel="Approving…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : null}

                  {serviceEstimate.status === 'APPROVED' && isEligibleManager ? (
                    <form action={approveServiceEstimateAsManagerFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                        The supervisor has validated this estimate — it&apos;s ready for your own final sign-off.
                      </p>
                      <SubmitButton
                        label="Approve as manager"
                        pendingLabel="Approving…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : null}

                  {serviceEstimate.status === 'APPROVED' ? (
                    <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                      Approved by {serviceEstimate.approvedBy?.fullName ?? '—'}
                      {serviceEstimate.approvedAt ? ` on ${formatDateOnly(serviceEstimate.approvedAt)}` : ''} — awaiting the Workshop Manager&apos;s own final sign-off.
                    </p>
                  ) : null}

                  {serviceEstimate.status === 'MANAGER_APPROVED' && !serviceEstimate.customerNotifiedAt && isEstimateCreator ? (
                    <form action={notifyCustomerOfApprovedServiceEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
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
                  {serviceEstimate.status === 'MANAGER_APPROVED' && serviceEstimate.customerNotifiedAt ? (
                    <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                      Customer notified on {formatDateTime(serviceEstimate.customerNotifiedAt)}.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {serviceEstimate?.customerNotifiedAt ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Payments</h2>
                <span className="text-xs text-[var(--ejo-text-muted)]">
                  {formatNaira(paymentsTotal)} of {formatNaira(estimateTotal)}
                </span>
              </div>
              {payments.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {payments.map((p: (typeof payments)[number]) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-[var(--ejo-text)]">{formatNaira(Number(p.amount))}</span>
                        <span className="ml-2 text-xs text-[var(--ejo-text-muted)]">{p.method === 'CASH' ? 'Cash' : 'Bank Transfer'}</span>
                        <p className="text-xs text-[var(--ejo-text-muted)]">
                          {p.recordedBy.fullName} · {formatDateOnly(p.recordedAt)}
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
              ) : null}

              {estimateTotal > 0 && paymentsTotal >= estimateTotal ? (
                <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs font-medium text-[var(--ejo-success)]">
                  Paid in full — nothing further to record.
                </p>
              ) : (service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE') && isEligibleFinance ? (
                <>
                  <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                    Recording is fully automatic — the move to In Service happens the moment the total recorded
                    first reaches the 70% minimum deposit, with no separate approval step.
                  </p>
                  <form key={payments.length} action={recordServicePaymentFormAction} className="mt-3 grid grid-cols-2 gap-2">
                    <input type="hidden" name="vehicleServiceId" value={service.id} />
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
          {sourcingNeeds.isEligibleToSource && sourcingNeeds.needsStoreParts ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Sourcing</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Auto-detected from this Vehicle Service&apos;s own estimate — Store parts are requested and tracked here.
              </p>
              <div className="mt-4 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-info)]/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-info)]">
                      <path d="M3 6.5L10 3l7 3.5-7 3.5-7-3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M3 6.5V14l7 3.5 7-3.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M10 10v7.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    <h3 className="text-xs font-semibold text-[var(--ejo-text)]">Store Parts</h3>
                  </div>
                  {sourcingNeeds.hasRequestablePartLines && sourcingNeeds.serviceEstimateId ? (
                    <form action={requestServiceEstimatePartRequestSlipFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="serviceEstimateId" value={sourcingNeeds.serviceEstimateId} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <SubmitButton
                        label="+ Request Store Parts"
                        pendingLabel="Requesting…"
                        className="inline-flex items-center gap-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : sourcingNeeds.existingPartRequestSlips.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-1 text-xs font-medium text-[var(--ejo-success)]">
                      All requested
                    </span>
                  ) : null}
                </div>
                {sourcingNeeds.existingPartRequestSlips.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No requests raised yet.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {sourcingNeeds.existingPartRequestSlips.map((slip: (typeof sourcingNeeds.existingPartRequestSlips)[number]) => (
                      <LoadingLink
                        key={slip.id}
                        href={`/workshop/parts-requests/${slip.id}`}
                        className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs hover:opacity-80"
                      >
                        <span className="font-medium text-[var(--ejo-text)]">{slip.referenceNumber}</span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${PART_REQUEST_STATUS_BADGE_CLASS[slip.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>
                          {PART_REQUEST_STATUS_LABEL[slip.status] ?? slip.status}
                        </span>
                      </LoadingLink>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {(service.nextServiceDueOdometer || service.nextServiceDueDate) ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next Service Due</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {service.nextServiceDueOdometer ? `${service.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null}
                {service.nextServiceDueOdometer && service.nextServiceDueDate ? ' or ' : null}
                {service.nextServiceDueDate ? formatDateOnly(service.nextServiceDueDate) : null}
                {' — whichever comes first.'}
              </p>
              {service.primaryServiceMileage != null ? (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                  Based on Primary Service done at {service.primaryServiceMileage.toLocaleString('en-NG')} km
                  {service.primaryServiceDate ? ` on ${formatDateOnly(service.primaryServiceDate)}` : ''}.
                </p>
              ) : null}
            </div>
          ) : null}

          {service.technicianNotes ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Technician Notes</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">{service.technicianNotes}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pb-6">
          {isApprover && service.approvalStatus === 'PENDING' ? (
            <div id="review-approval" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Vehicle Service</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approve to confirm this Vehicle Service can proceed, or reject it back to {service.createdBy.fullName}{' '}
                with a reason — a rejection doesn&apos;t have to mean something was wrong; availability or workload
                are valid reasons too.
              </p>
              <form action={approveVehicleServiceFormAction} className="mt-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
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
              <form action={rejectVehicleServiceFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
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

          {nextAction ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{nextAction.label}</h2>
              <form action={updateVehicleServiceStatusFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="newStatus" value={nextAction.status} />
                {nextAction.status === 'CHECKED_IN' ? (
                  service.odometerAtService != null && editMileage !== 'true' ? (
                    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2">
                      <p className="text-xs text-[var(--ejo-text-muted)]">Odometer (from check-in)</p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--ejo-text)]">
                        {service.odometerAtService.toLocaleString('en-NG')} km
                      </p>
                      <input type="hidden" name="odometerAtService" value={service.odometerAtService} />
                      <LoadingLink
                        href={`/workshop/vehicle-service/${service.id}?editMileage=true`}
                        className="mt-1 inline-block text-xs text-[var(--ejo-primary)] hover:underline"
                      >
                        Edit mileage
                      </LoadingLink>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Odometer (km)</label>
                      <input
                        name="odometerAtService"
                        type="number"
                        min="0"
                        defaultValue={service.odometerAtService ?? undefined}
                        placeholder={service.vehicle.mileage ? String(service.vehicle.mileage) : 'e.g. 52430'}
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                    </div>
                  )
                ) : null}
                {nextAction.status === 'COMPLETED' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Technician Notes</label>
                      <textarea
                        name="technicianNotes"
                        rows={3}
                        placeholder="What was actually done…"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                    </div>
                    <label className="flex items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-xs text-[var(--ejo-text)]">
                      <input type="checkbox" name="primaryServiceCompleted" className="mt-0.5 h-4 w-4 rounded border-[var(--ejo-border)]" />
                      <span>
                        <span className="font-medium">Engine oil was changed on this visit</span>
                        <span className="block text-[var(--ejo-text-muted)]">
                          This is what tells the system when the vehicle is next due — based on this
                          odometer reading. Leave unchecked if oil wasn&apos;t changed today.
                        </span>
                      </span>
                    </label>
                  </>
                ) : null}
                <SubmitButton
                  label={nextAction.label}
                  pendingLabel="Saving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {service.approvalStatus === 'APPROVED' && service.status !== 'COLLECTED' && service.status !== 'CANCELLED' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Assign technician</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Currently: {service.assignedTechnician?.fullName ?? 'Unassigned'}
              </p>
              <form action={assignTechnicianToVehicleServiceFormAction} className="mt-4 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <select
                  name="technicianId"
                  defaultValue={service.assignedTechnician?.id ?? ''}
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

          {service.status !== 'COLLECTED' && service.status !== 'CANCELLED' && isAssignedTechnician && service.technicianAcceptanceStatus === 'PENDING' ? (
            <div id="technician-response" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Respond to this assignment</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {service.assignedTechnician?.fullName}, you&apos;ve been assigned to this Vehicle Service. Accept to
                begin, or reject with a reason if you can&apos;t take it on.
              </p>
              <form action={acceptVehicleServiceTechnicianAssignmentFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <SubmitButton
                  label="Accept"
                  pendingLabel="Accepting…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectVehicleServiceTechnicianAssignmentFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
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

          {canCancel ? (
            <form action={updateVehicleServiceStatusFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="serviceId" value={service.id} />
              <input type="hidden" name="newStatus" value="CANCELLED" />
              <button type="submit" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">
                Cancel this Vehicle Service
              </button>
            </form>
          ) : null}

          {isMasterAdmin ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Danger zone</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Permanently deletes this Vehicle Service and its requests. This cannot be undone.
              </p>
              <form action={deleteVehicleServiceFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Delete Vehicle Service ${service.serviceNumber}? This permanently removes it and its requests. This cannot be undone.`}
                  label="Delete this Vehicle Service"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened</dt>
                <dd className="text-[var(--ejo-text)]">{formatDateTime(service.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened By</dt>
                <dd className="text-[var(--ejo-text)]">{service.createdBy.fullName}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
        {auditTrail.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p>
        ) : (
          <AuditTrail
            entries={auditTrail.map((entry: (typeof auditTrail)[number]) => ({
              id: entry.id,
              actionLabel: AUDIT_ACTION_LABEL[entry.action] ?? entry.action,
              userName: entry.user?.fullName ?? null,
              detail: formatAuditDetail(entry),
              dateLabel: formatDateTime(entry.createdAt),
            }))}
          />
        )}
      </div>
    </div>
  );
}
