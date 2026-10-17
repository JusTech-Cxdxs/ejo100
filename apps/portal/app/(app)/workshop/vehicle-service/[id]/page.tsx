import { actorLabel } from '@/lib/assist/rules';
import { canRequestRoadTestOn } from '@/lib/actions/security';
import { serviceVisible, guardAnyPage, can, allows } from '@/lib/authz/server';
import { organisationOfBranch, priceWarnings, shownDuration } from '@/lib/enyo/ml/models';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { ReadyEstimate, UnusualPrice } from '@/components/enyo/EnyoInsights';
import { RoadTestsPanel } from '@/components/RoadTestsPanel';
import { listRoadTestsFor } from '@/lib/actions/security';
import { securityActionDetail } from '@/lib/security-labels';
import { notFound } from 'next/navigation';
import { humanizeAction } from '@/lib/humanize-action';
import { listWarrantiesFor, getPartWarrantyBadges } from '@/lib/actions/warranty';
import { WarrantyList } from '@/components/WarrantyList';
import { getVehicleService, getVehicleServiceAuditTrail, getVehicleServiceCloseRequests, getVehicleServiceCancellationRequests } from '@/lib/actions/vehicle-service';
import { listRefunds } from '@/lib/actions/refunds';
import { RefundsPanel } from '@/components/RefundsPanel';
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
  requestVehicleServiceCloseFormAction,
  approveVehicleServiceCloseRequestFormAction,
  declineVehicleServiceCloseRequestFormAction,
  requestVehicleServiceCancellationFormAction,
  approveVehicleServiceCancellationFormAction,
  declineVehicleServiceCancellationFormAction,
  handBackCancelledVehicleServiceFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { PaymentAmountField } from '@/components/PaymentAmountField';
import { MINIMUM_DEPOSIT_FRACTION, COMMON_ESTIMATE_LINE_DESCRIPTIONS } from '@/lib/workshop-constants';
import { ServiceEstimateLineItemForm } from '@/components/ServiceEstimateLineItemForm';
import { LikelyLinesCard } from '@/components/enyo/LikelyLinesCard';
import { Suspense } from 'react';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupervisorPicker } from '@/components/SupervisorPicker';
import { AuditTrail } from '@/components/AuditTrail';
import { PrintMenu } from '@/components/print/PrintMenu';
import { RecycleBinPanel } from '@/components/RecycleBinPanel';
import { getRecycleBinOffer } from '@/lib/actions/recycle-bin';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { EstimateLinesTable, EstimateLineEditLink, EstimateLineRemoveButton, EstimateLineEditor, type EstimateLineView } from '@/components/EstimateLinesTable';
import { IdempotencyKey } from '@/components/IdempotencyKey';
import { BackLink, PageTitle, StatusChip } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  COLLECTED: 'Checked Out',
  CANCELLED: 'Cancelled',
  ESCALATED: 'Escalated to Job Card',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PARTIAL: 'Partial Payment',
  DEPOSIT_MET: 'Minimum Met — Balance Pending',
  PAID_IN_FULL: 'Payment Completed',
  REFUND_DUE: 'Cancelled — Refund Due',
  REFUNDED: 'Cancelled — Refunded',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  PARTIAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  DEPOSIT_MET: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  PAID_IN_FULL: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REFUND_DUE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  REFUNDED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
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
  // No manual move to IN_SERVICE: after inspection the service either
  // continues with an estimate (the 70% deposit moves it on, see
  // recordServicePayment) or escalates to a Job Card.
  CHECKED_IN: null,
  IN_SERVICE: { status: 'COMPLETED', label: 'Complete Service' },
  // Same ending as a Job Card: Ready for Collection → Manager-approved close → Check Out.
  COMPLETED: { status: 'READY_FOR_COLLECTION', label: 'Mark Ready for Collection' },
  READY_FOR_COLLECTION: null,
  CLOSED: { status: 'COLLECTED', label: 'Check Out Vehicle' },
  COLLECTED: null,
  ESCALATED: null,
  CANCELLED: null,
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'vehicle_service.moved_to_recycle_bin': 'Moved to the Recycle bin',
  'vehicle_service.restored_from_recycle_bin': 'Restored from the Recycle bin',
  'road_test.requested': 'Road test requested',
  'road_test.approved': 'Road test approved by the Manager',
  'road_test.declined': 'Road test declined',
  'road_test.cancelled': 'Road test cancelled',
  'road_test.gate_out': 'Out on road test',
  'road_test.gate_in': 'Back from road test',
  'vehicle.gate_exit': 'Left through the gate',
  'warranty.issued': 'Warranties issued',
  'vehicle_service.created': 'Vehicle Service opened',
  'vehicle_service.approved': 'Vehicle Service approved',
  'vehicle_service.rejected': 'Vehicle Service rejected',
  'vehicle_service.status_updated': 'Status updated',
  'vehicle_service.technician_assigned': 'Technician assigned',
  'vehicle_service.escalated_to_job_card': 'Escalated to Job Card',
  'vehicle_service.attended_to': 'Overdue prediction attended to',
  'vehicle_service.close_requested': 'Close requested',
  'vehicle_service.close_declined': 'Close request declined',
  'refund.recorded': 'Refund recorded',
  'vehicle_service.cancellation_requested': 'Cancellation requested',
  'vehicle_service.cancellation_approved': 'Cancellation approved',
  'vehicle_service.cancellation_declined': 'Cancellation request declined',
  'vehicle_service.handed_back': 'Vehicle handed back after cancellation',
  'vehicle_service.cancelled_collection_notice_sent': 'Collection notice sent to the customer (cancelled vehicle)',
  'refund.completed': 'Refund completed — all money returned',
  'vehicle_service.deleted': 'Vehicle Service deleted',
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

// Prisma returns Decimal objects; amounts are stored rounded to 2dp.
function formatNaira(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  if (entry.action.startsWith('road_test.')) return securityActionDetail(entry.action, meta);
  switch (entry.action) {
    case 'vehicle.gate_exit':
      return [typeof meta.exitNumber === 'string' ? meta.exitNumber : null, typeof (meta.collectedBy ?? meta.driver) === 'string' ? `collected by ${String(meta.collectedBy ?? meta.driver)}` : null].filter(Boolean).join(' · ') || null;
    case 'warranty.issued':
      return Array.isArray(meta.warrantyNumbers) ? `${(meta.warrantyNumbers as string[]).join(', ')}${typeof meta.referenceNumber === 'string' ? ` — with ${meta.referenceNumber}` : ''}` : null;
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
    // Same detail format as the Job Card page's formatAuditDetail.
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
  await guardAnyPage(['workshop.view'], '/workshop');
  const { editMileage, editLineId, error, status } = await searchParams;
  const { id } = await params;
  // Round 1: everything that needs only the id, in parallel (each database
  // round trip crosses regions). An id the viewer can't see is a 404.
  if (!(await serviceVisible(id, 'page'))) notFound();
  const [service, isMasterAdmin, viewerId, technicians, auditTrail, inspection, serviceEstimate, payments, sourcingNeeds, closeRequests, refunds, warranties, roadTests, cancellationRequests, binOffer] = await Promise.all([
    getVehicleService(id),
    currentUserIsMasterAdmin(),
    currentUserId(),
    listTechnicianCandidates(),
    getVehicleServiceAuditTrail(id),
    getVehicleInspection(id),
    getServiceEstimate(id),
    getVehicleServicePayments(id),
    getVehicleServiceSourcingNeeds(id),
    getVehicleServiceCloseRequests(id),
    listRefunds({ vehicleServiceId: id }),
    listWarrantiesFor({ vehicleServiceId: id }),
    listRoadTestsFor({ vehicleServiceId: id }),
    getVehicleServiceCancellationRequests(id),
    getRecycleBinOffer('VehicleService', id),
  ]);
  if (!service) notFound();
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');

  const isApprover = isMasterAdmin || service.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || service.assignedTechnician?.id === viewerId;
  // Escalated = handed over to a Job Card: this record becomes read-only
  // (every action is also refused on the server).
  const isReadOnly = service.status === 'ESCALATED' || Boolean(service.escalatedToJobCard);
  const isEstimateContributor = !isReadOnly && (isMasterAdmin || service.supervisor?.id === viewerId || service.assignedTechnician?.id === viewerId);
  const nextAction = NEXT_ACTION[service.status];
  // Round 2: what needs the branch or the estimate.
  const [partTypes, partCategories, eligibleFinance, eligibleManagers, partWarrantyBadges] = await Promise.all([
    listPartTypes(service.branchId),
    listPartCategories(service.branchId),
    listEligibleFinanceOfficersForBranch(service.branchId),
    listEligibleManagersForBranch(service.branchId),
    getPartWarrantyBadges((serviceEstimate?.lineItems ?? []).map((li: { matchedPartId: string | null }) => li.matchedPartId ?? '')),
  ]);
  // Enyo, when switched on at Assist: unusual typed-in prices and when the vehicle is likely ready. Never in the way.
  // The record's own organisation decides (its model and level), never the viewer's.
  const enyoOrg = await organisationOfBranch(service.branchId).catch(() => null);
  const [priceFlags, readyEstimate, enyoName] = await Promise.all([
    priceWarnings(enyoOrg, (serviceEstimate?.lineItems ?? []).map((li: { id: string; type: string; description: string; quantity: unknown; unitPrice: unknown }) => ({ id: li.id, type: li.type, description: li.description, quantity: Number(li.quantity) || 1, unitPrice: li.unitPrice == null ? null : Number(li.unitPrice) }))).catch(() => new Map()),
    service.readyForCollectionAt ? Promise.resolve(null) : shownDuration({ kind: 'SERVICE', id: id }, enyoOrg).catch(() => null),
    getEnyoSettings(enyoOrg).then((x) => x.displayName),
  ]);
  const partCategoriesWithTypes = partCategories.map((category: (typeof partCategories)[number]) => ({
    id: category.id,
    name: category.name,
    types: partTypes.filter((t: (typeof partTypes)[number]) => t.categoryId === category.id).map((t: (typeof partTypes)[number]) => ({ id: t.id, name: t.name, typicalUnit: t.typicalUnit })),
  }));
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);
  const isEligibleManager = isMasterAdmin || eligibleManagers.supervisors.some((m: { id: string }) => m.id === viewerId);
  // The person who opened the Vehicle Service, as checked by
  // notifyCustomerOfApprovedServiceEstimate on the server.
  const isEstimateCreator = isMasterAdmin || service.createdBy.id === viewerId;
  const hasUnmatchedStoreParts = serviceEstimate?.lineItems.some((li: { type: string; matchedPartId: string | null }) => li.type === 'STORE_PART' && !li.matchedPartId) ?? false;
  // While Draft, a matched Store Part line follows the part's current price.
  function getLiveLineAmount(item: { type: string; quantity: unknown; amount: unknown; matchedPart: { sellingPrice: unknown } | null }): number {
    if (item.type === 'STORE_PART' && item.matchedPart && serviceEstimate?.status === 'DRAFT' && item.matchedPart.sellingPrice !== null) {
      return Math.round(Number(item.quantity) * Number(item.matchedPart.sellingPrice) * 100) / 100;
    }
    return item.amount !== null ? Number(item.amount) : 0;
  }
  const estimateTotal = (serviceEstimate?.lineItems ?? []).reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const paymentsTotal = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount ?? 0), 0);
  const refundedTotal = refunds.reduce((sum: number, r: (typeof refunds)[number]) => sum + Number(r.amount), 0);
  const pendingCancellation = cancellationRequests.find((r: (typeof cancellationRequests)[number]) => r.status === 'PENDING') ?? null;
  const approvedCancellation = cancellationRequests.find((r: (typeof cancellationRequests)[number]) => r.status === 'APPROVED') ?? null;
  // Same rule as the server: creator, supervisor or Master Admin, while
  // the service can still be cancelled.
  const canRequestCancellation =
    ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(service.status) &&
    !service.escalatedToJobCard &&
    (isMasterAdmin || service.createdBy.id === viewerId || service.supervisor?.id === viewerId);
  // Same rule the server enforces for close and check-out.
  const isPaidInFull = paymentsTotal >= estimateTotal;
  const pendingCloseRequest = closeRequests.find((r: (typeof closeRequests)[number]) => r.status === 'PENDING') ?? null;
  // Who may take each step — mirrors requireVehicleServiceStepRole.
  // Checking a vehicle in is a front-desk step (the server checks the same).
  const canCheckIn = nextAction?.status === 'CHECKED_IN' ? (await can('workshop.job_card.create', { branchId: service.branchId })).allowed : false;
  const canTakeNextAction =
    nextAction?.status === 'CHECKED_IN'
      ? canCheckIn
      : nextAction?.status === 'COMPLETED' || nextAction?.status === 'COLLECTED'
      ? isApprover || isAssignedTechnician || isEligibleManager
      : nextAction?.status === 'READY_FOR_COLLECTION'
        ? isApprover || isEligibleManager
        : true;
  const isActiveVisit = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const minimumDeposit = Math.round(estimateTotal * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  // A cancelled job that took money shows refund progress, not payment progress.
  const paymentStatus: 'AWAITING_PAYMENT' | 'PARTIAL' | 'DEPOSIT_MET' | 'PAID_IN_FULL' | 'REFUND_DUE' | 'REFUNDED' =
    service.status === 'CANCELLED' && paymentsTotal > 0
      ? refunds.reduce((sum: number, r: (typeof refunds)[number]) => sum + Number(r.amount), 0) >= paymentsTotal - 0.004
        ? 'REFUNDED'
        : 'REFUND_DUE'
      : paymentsTotal <= 0
      ? 'AWAITING_PAYMENT'
      : estimateTotal > 0 && paymentsTotal >= estimateTotal
        ? 'PAID_IN_FULL'
        : estimateTotal > 0 && paymentsTotal >= minimumDeposit
          ? 'DEPOSIT_MET'
          : 'PARTIAL';
  // Payments show once the customer has been notified or any payment exists.
  const showPayments = payments.length > 0 || Boolean(serviceEstimate?.customerNotifiedAt);

  const canRoadTest = await canRequestRoadTestOn('VEHICLE_SERVICE', service.id);
  return (
    <div className="p-8">
      <BackLink href="/workshop/vehicle-service" label="Back to Vehicle Service" className="mb-4" />

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
          <FormFeedbackBanner kind="success" message="Estimate cancelled. You can now escalate to a Job Card." />
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
          <FormFeedbackBanner kind="success" message="Line matched to a Store part." />
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
      {status === 'cancellation_requested' ? (
        <div className="mb-6 max-w-xl"><FormFeedbackBanner kind="success" message="Cancellation requested — every Manager has been notified." /></div>
      ) : null}
      {status === 'cancellation_approved' ? (
        <div className="mb-6 max-w-xl"><FormFeedbackBanner kind="success" message="Cancellation approved — the customer and team have been notified." /></div>
      ) : null}
      {status === 'cancellation_declined' ? (
        <div className="mb-6 max-w-xl"><FormFeedbackBanner kind="success" message="Cancellation request declined — the requester has been notified." /></div>
      ) : null}
      {status === 'handed_back' ? (
        <div className="mb-6 max-w-xl"><FormFeedbackBanner kind="success" message="Vehicle handed back." /></div>
      ) : null}
      {status === 'refund_recorded' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Refund recorded — the customer has been emailed their receipt." />
        </div>
      ) : null}
      {status === 'close_requested' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Close requested — every Manager has been notified." />
        </div>
      ) : null}
      {status === 'close_approved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Close approved — this Vehicle Service is now closed." />
        </div>
      ) : null}
      {status === 'close_declined' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Close request declined — the requester has been notified." />
        </div>
      ) : null}
      {status === 'checked_out' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Vehicle checked out." />
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

      <div className="ejo-hero relative mb-6 flex flex-wrap items-center gap-3 overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-4 sm:p-5">
        <div className="ejo-orb pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <PageTitle icon="droplet" className="relative mr-1">{service.serviceNumber}</PageTitle>
        {service.escalatedToJobCard ? <StatusChip tone="warning">Escalated</StatusChip> : <StatusChip status={service.status} label={STATUS_LABEL[service.status]} />}
        {showPayments ? (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_STATUS_COLOR[paymentStatus]}`}>
            {PAYMENT_STATUS_LABEL[paymentStatus]}
          </span>
        ) : null}
      </div>

      {service.escalatedToJobCard ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-4 text-sm">
          A repair beyond routine maintenance was found — this visit was sent to{' '}
          <LoadingLink href={`/workshop/job-cards/${service.escalatedToJobCard.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            Job Card {service.escalatedToJobCard.jobNumber}
          </LoadingLink>
          {service.escalatedAt ? ` on ${formatDateTime(service.escalatedAt)}` : ''}, which now handles the work, payment and check-out.
          <span className="mt-1 block text-xs text-[var(--ejo-text-muted)]">
            This service is closed and read-only. The vehicle&apos;s next-service count starts when that Job Card is checked out.
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer &amp; vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  <CustomerLink id={service.customerId} name={service.customer.fullName} canView={canSeeCustomers} />
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
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle inspection</h2>
              {inspection?.status === 'IN_PROGRESS' || inspection?.status === 'COMPLETED' ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${inspection.status === 'COMPLETED' ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'}`}>
                  {inspection.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                </span>
              ) : inspection?.status === 'SKIPPED' ? (
                <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-text-muted)]">Skipped</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              What the supervisor or technician found on this vehicle.
            </p>
            {isReadOnly ? (
              <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
                {inspection ? (
                  <LoadingLink href={`/workshop/vehicle-service/${service.id}/inspection`} className="text-[var(--ejo-primary)] hover:underline">
                    View inspection
                  </LoadingLink>
                ) : (
                  'No inspection was recorded.'
                )}{' '}
                (read-only, this service was escalated).
              </p>
            ) : !inspection ? (
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
                  {serviceEstimate ? 'Service Estimate' : 'Next step'}
                </h2>
                {serviceEstimate ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        serviceEstimate.status === 'MANAGER_APPROVED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : serviceEstimate.status === 'SUBMITTED' || serviceEstimate.status === 'APPROVED'
                            ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                            : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                      }`}
                    >
                      {serviceEstimate.status === 'APPROVED' && isEligibleManager && serviceEstimate.approvedById !== viewerId && serviceEstimate.createdById !== viewerId ? 'Waiting for you (Manager)' : SERVICE_ESTIMATE_STATUS_LABEL[serviceEstimate.status] ?? serviceEstimate.status}
                    </span>
                    {serviceEstimate.status === 'MANAGER_APPROVED' ? (
                      <PrintMenu
                        orgHref={`/print/vehicle-service/${service.id}/estimate`}
                        clientHref={`/print/vehicle-service/${service.id}/estimate?variant=client`}
                        clientLabel="Customer Copy"
                        size="compact"
                        align="right"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {serviceEstimate
                  ? 'Routine work that does not need a Job Card, such as engine oil and filters. The customer still approves the price.'
                  : 'Routine work continues here with its own estimate. Repairs beyond routine service should be escalated to a Job Card.'}
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
                    <h3 className="text-sm font-semibold text-[var(--ejo-error)]">Or escalate to a Job Card</h3>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                      For repair work. This opens a Job Card for this vehicle, and the estimate is prepared and
                      approved there.
                    </p>
                    {(() => {
                      const findings = (inspection?.items ?? []).filter(
                        (i: { severity: string | null }) => i.severity === 'ATTENTION' || i.severity === 'SERVICE_REQUIRED' || i.severity === 'CRITICAL',
                      );
                      return findings.length > 0 ? (
                        <p className="mt-2 text-xs text-[var(--ejo-text)]">
                          <span className="font-medium">{findings.length}</span> inspection finding{findings.length === 1 ? '' : 's'} will be
                          copied into the new Job Card as complaints.
                        </p>
                      ) : null;
                    })()}
                    <form action={escalateVehicleServiceFormAction} className="mt-3 space-y-3">
                      <FormPendingOverlay />
                      <input type="hidden" name="serviceId" value={service.id} />
                      <SupervisorPicker vehicleType={service.vehicle.vehicleType} defaultSupervisorId={service.supervisor?.id} />
                      <textarea id="vs-escalate-complaint"
                        name="additionalComplaint"
                        rows={2}
                        placeholder="Anything else to add (optional)"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                      <RefineTextButton targetId="vs-escalate-complaint" />
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
                    <div className="mt-4">
                    {readyEstimate ? <ReadyEstimate prediction={readyEstimate} name={enyoName} /> : null}
                    <EstimateLinesTable
                      withActions={isEstimateContributor}
                      lines={serviceEstimate.lineItems.map((line: (typeof serviceEstimate.lineItems)[number]): EstimateLineView => {
                        const canModifyThis = serviceEstimate.status !== 'MANAGER_APPROVED' && isEstimateContributor && (viewerId === line.enteredById || isApprover);
                        const isEditingThis = editLineId === line.id && canModifyThis;
                        const needsMatch = line.type === 'STORE_PART' && !line.matchedPartId;
                        // Display only: the matched unit, or the Part Type's typical unit.
                        const storePartPreviewUnit =
                          line.type === 'STORE_PART'
                            ? (line.unitOfMeasure ?? partTypes.find((t: (typeof partTypes)[number]) => t.id === line.partTypeId)?.typicalUnit ?? null)
                            : null;
                        const rawUnit = line.type === 'STORE_PART' ? storePartPreviewUnit : line.unitOfMeasure;
                        const displayUnit = rawUnit ? pluralizeWord(Number(line.quantity), rawUnit) : '—';
                        // While Draft, show the matched part's current selling price.
                        const liveUnitPrice =
                          line.type === 'STORE_PART' && line.matchedPart && serviceEstimate.status === 'DRAFT' && line.matchedPart.sellingPrice !== null
                            ? Number(line.matchedPart.sellingPrice)
                            : line.unitPrice != null
                              ? Number(line.unitPrice)
                              : null;
                        const liveAmount = liveUnitPrice != null ? Math.round(Number(line.quantity) * liveUnitPrice * 100) / 100 : null;
                        const typeLabel = SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[line.type] ?? line.type;
                        return {
                          id: line.id,
                          typeLabel,
                          description: line.description,
                          notes: (
                            <>
                              {line.type === 'STORE_PART' && line.matchedPartId && partWarrantyBadges[line.matchedPartId] ? (
                                <div className="mt-0.5 text-[11px] font-medium text-[var(--ejo-success)]">Warranty: {partWarrantyBadges[line.matchedPartId]} — issued automatically when released</div>
                              ) : null}
                              {line.type === 'STORE_PART' ? (
                                line.matchedPart ? (
                                  <div className="mt-0.5 text-[11px] text-[var(--ejo-success)]">Matched: {line.matchedPart.name}</div>
                                ) : (
                                  <div className="mt-0.5 text-[11px] font-medium text-[var(--ejo-warning-text)]">Awaiting Store match</div>
                                )
                              ) : null}
                              {priceFlags.get(line.id) ? <UnusualPrice check={priceFlags.get(line.id)!} /> : null}
                            </>
                          ),
                          quantity: Number(line.quantity),
                          unit: displayUnit,
                          unitPrice: liveUnitPrice != null ? formatNaira(liveUnitPrice) : needsMatch ? 'Awaiting match' : '—',
                          liveTag: line.type === 'STORE_PART' && Boolean(line.matchedPart) && serviceEstimate.status === 'DRAFT',
                          amount: liveAmount != null ? formatNaira(liveAmount) : '—',
                          enteredBy: line.enteredBy.fullName,
                          actions: canModifyThis ? (
                            <>
                              <EstimateLineEditLink href={`/workshop/vehicle-service/${service.id}?editLineId=${line.id}`} />
                              <form action={removeServiceEstimateLineItemFormAction} className="inline-flex items-center">
                                <FormPendingOverlay />
                                <input type="hidden" name="lineItemId" value={line.id} />
                                <input type="hidden" name="vehicleServiceId" value={service.id} />
                                <EstimateLineRemoveButton />
                              </form>
                            </>
                          ) : null,
                          editor: isEditingThis ? (
                            <EstimateLineEditor
                              action={updateServiceEstimateLineItemFormAction}
                              hidden={
                                <>
                                  <input type="hidden" name="vehicleServiceId" value={service.id} />
                                  <input type="hidden" name="lineItemId" value={line.id} />
                                </>
                              }
                              typeLabel={typeLabel}
                              description={line.description}
                              quantity={Number(line.quantity)}
                              unitOfMeasure={line.unitOfMeasure}
                              storePartUnit={storePartPreviewUnit}
                              isStorePart={line.type === 'STORE_PART'}
                              unitPrice={line.unitPrice != null ? Number(line.unitPrice) : null}
                              datalistId="service-estimate-line-suggestions"
                              cancelHref={`/workshop/vehicle-service/${service.id}`}
                            />
                          ) : undefined,
                        };
                      })}
                    />
                    </div>
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

                  {serviceEstimate.status === 'DRAFT' && isEstimateContributor ? (
                    // Enyo (Suggest mode only): lines similar jobs had; "Add" fills in the form below.
                    <Suspense fallback={null}>
                      <LikelyLinesCard kind="SERVICE" id={service.id} existing={serviceEstimate.lineItems} />
                    </Suspense>
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
                        <input id="vs-note-supervisor"
                          name="note"
                          placeholder="e.g. Parts priced, ready to check"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                        />
                        <RefineTextButton targetId="vs-note-supervisor" />
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
                        <input id="vs-note-technician"
                          name="note"
                          placeholder="e.g. Please add the pricing"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                        />
                        <RefineTextButton targetId="vs-note-technician" />
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
                          ? 'Store matching requested. You can submit once the Store has matched every Store Part line.'
                          : 'Store Part lines are priced when the Store matches them. Request Store matching to continue.'}
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
                        Every line needs a price. The supervisor validates the estimate next.
                      </p>
                      <SubmitButton
                        label="Submit for validation"
                        pendingLabel="Submitting…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : null}

                  {serviceEstimate.status === 'SUBMITTED' && isApprover && !isReadOnly ? (
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

                  {serviceEstimate.status === 'APPROVED' && isEligibleManager && !isReadOnly ? (
                    <form action={approveServiceEstimateAsManagerFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                        The supervisor has validated this estimate. It is ready for your approval.
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
                      {serviceEstimate.approvedAt ? ` on ${formatDateOnly(serviceEstimate.approvedAt)}` : ''} — awaiting the Manager&apos;s own final sign-off.
                    </p>
                  ) : null}

                  {serviceEstimate.status === 'MANAGER_APPROVED' && !serviceEstimate.customerNotifiedAt && isEstimateCreator && !isReadOnly ? (
                    <form action={notifyCustomerOfApprovedServiceEstimateFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">
                        Approved by the manager. Check the estimate, then notify the customer.
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

          <RoadTestsPanel rows={roadTests} ready={service.status === 'COMPLETED'} requestHref={['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'].includes(service.status) && canRoadTest ? `/security/road-tests/new?vehicleServiceId=${service.id}` : null} />

          <WarrantyList warranties={warranties} title="Warranties issued" />

          {refunds.length > 0 || ((service.status === 'CANCELLED' || pendingCancellation) && paymentsTotal > 0) ? (
            <RefundsPanel
              target={{ vehicleServiceId: service.id }}
              paid={paymentsTotal}
              refunds={refunds}
              isCancelled={service.status === 'CANCELLED'}
              canRecord={isEligibleFinance}
              defaultPaidTo={service.customer.fullName}
              defaultReason={approvedCancellation?.reason ?? pendingCancellation?.reason ?? 'Vehicle Service cancelled'}
            />
          ) : null}

          {showPayments ? (
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
                          {formatNaira(Number(p.amount))} — {p.method === 'CASH' ? 'Cash' : 'Bank Transfer'}
                        </p>
                        <p className="text-xs text-[var(--ejo-text-muted)]">
                          {p.recordedBy.fullName} · {formatDateTime(p.recordedAt)}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 text-sm font-semibold text-[var(--ejo-text)]">
                    <span>Total recorded</span>
                    <span>{formatNaira(paymentsTotal)}</span>
                  </div>
                  {estimateTotal > 0 && paymentsTotal < estimateTotal ? (
                    <div className="flex justify-between text-sm text-[var(--ejo-warning)]">
                      <span>Balance remaining</span>
                      <span>{formatNaira(estimateTotal - paymentsTotal)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {estimateTotal > 0 && paymentsTotal >= estimateTotal ? (
                <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs font-medium text-[var(--ejo-success)]">
                  Paid in full — nothing further to record.
                </p>
              ) : ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(service.status) && isEligibleFinance ? (
                <>
                  <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                    Once payments reach the 70% minimum deposit, the service moves to In Service automatically.
                    Pick a suggested amount or choose &quot;Other&quot; to enter a different one.
                  </p>
                  <form key={payments.length} action={recordServicePaymentFormAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <IdempotencyKey />
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
                      className="col-span-full min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
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
                Based on this Vehicle Service&apos;s estimate. Store parts are requested and tracked here.
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
                  {sourcingNeeds.hasRequestablePartLines ? (
                    <LoadingLink
                      href={`/workshop/vehicle-service/${service.id}/request-parts`}
                      className="inline-flex items-center gap-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      + Request Store Parts
                    </LoadingLink>
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
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next service due</h2>
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

        <div className="space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pb-6">
          {isApprover && service.approvalStatus === 'PENDING' && !isReadOnly ? (
            <div id="review-approval" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Vehicle Service</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approve to let the work go ahead, or reject it back to {service.createdBy.fullName} with a reason
                (availability or workload are fine reasons).
              </p>
              <form action={approveVehicleServiceFormAction} className="mt-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <textarea id="vs-approve-notes"
                  name="notes"
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <RefineTextButton targetId="vs-approve-notes" />
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
                <textarea id="vs-reject-notes"
                  name="notes"
                  rows={2}
                  placeholder="Optional additional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <RefineTextButton targetId="vs-reject-notes" />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {nextAction && canTakeNextAction ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{nextAction.label}</h2>
              {nextAction.status === 'COLLECTED' && !isPaidInFull ? (
                <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  Payment must be completed in full before this vehicle can be checked out — {formatNaira(estimateTotal - paymentsTotal)} still outstanding.
                </p>
              ) : (
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
                      <textarea id="vs-technician-notes"
                        name="technicianNotes"
                        rows={3}
                        placeholder="Work done"
                        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                      />
                      <RefineTextButton targetId="vs-technician-notes" />
                    </div>
                    <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-xs text-[var(--ejo-text-muted)]">
                      Completing this service starts the vehicle&apos;s next-service count from this visit
                      {service.odometerAtService != null ? ` (${service.odometerAtService.toLocaleString('en-NG')} km)` : ''} — the customer is
                      told when it&apos;s next due, and reminders follow automatically.
                    </p>
                  </>
                ) : null}
                {nextAction.status === 'COLLECTED' ? (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Collected by (full name)</label>
                    <input
                      name="collectedByName"
                      required
                      defaultValue={service.customer.fullName}
                      placeholder="Person collecting the vehicle"
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ) : null}
                <SubmitButton
                  label={nextAction.label}
                  pendingLabel="Saving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              )}
            </div>
          ) : null}

          {service.status === 'READY_FOR_COLLECTION' && !service.escalatedToJobCard ? (
            <div id="close-request" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Request close</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                A Manager must approve before this Vehicle Service is closed.
              </p>
              {pendingCloseRequest ? (
                <>
                  <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                    Close requested by {pendingCloseRequest.requestedBy.fullName} on {formatDateTime(pendingCloseRequest.requestedAt)} — awaiting Manager approval.
                  </p>
                  {isEligibleManager ? (
                    <div className="mt-3 space-y-2">
                      <form action={approveVehicleServiceCloseRequestFormAction} className="space-y-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="serviceId" value={service.id} />
                        <input type="hidden" name="requestId" value={pendingCloseRequest.id} />
                        <input
                          name="decisionNotes"
                          placeholder="Notes (optional)"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                        />
                        <SubmitButton
                          label="Approve close"
                          pendingLabel="Approving…"
                          className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                        />
                      </form>
                      <form action={declineVehicleServiceCloseRequestFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="serviceId" value={service.id} />
                        <input type="hidden" name="requestId" value={pendingCloseRequest.id} />
                        <SubmitButton
                          label="Decline"
                          pendingLabel="Declining…"
                          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                        />
                      </form>
                    </div>
                  ) : null}
                </>
              ) : !isPaidInFull ? (
                <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  The balance must be paid in full before a close can be requested. Outstanding: {formatNaira(estimateTotal - paymentsTotal)}.
                </p>
              ) : isEstimateCreator || isApprover ? (
                <form action={requestVehicleServiceCloseFormAction} className="mt-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="serviceId" value={service.id} />
                  <SubmitButton
                    label="Request close"
                    pendingLabel="Requesting…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              ) : (
                <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Only this Vehicle Service&apos;s creator or supervisor can request the close.</p>
              )}
              {closeRequests.filter((r: (typeof closeRequests)[number]) => r.status === 'DECLINED').map((r: (typeof closeRequests)[number]) => (
                <p key={r.id} className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">
                  Earlier request declined by {r.decidedBy?.fullName ?? 'a Manager'}
                  {r.decidedAt ? ` on ${formatDateTime(r.decidedAt)}` : ''}
                  {r.decisionNotes ? ` — ${r.decisionNotes}` : ''}
                </p>
              ))}
            </div>
          ) : null}

          {service.status === 'COLLECTED' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Checked out</h2>
                <PrintMenu
                  orgHref={`/print/vehicle-service/${service.id}`}
                  clientHref={`/print/vehicle-service/${service.id}?variant=client`}
                  clientLabel="Customer Copy"
                  size="compact"
                  align="right"
                />
              </div>
              <p className="mt-2 text-xs text-[var(--ejo-text)]">
                Collected by <span className="font-medium">{service.collectedByName ?? '—'}</span>
                {service.collectedAt ? ` on ${formatDateTime(service.collectedAt)}` : ''}.
              </p>
            </div>
          ) : null}

          {service.approvalStatus === 'APPROVED' && isActiveVisit && (isMasterAdmin || service.supervisorId === viewerId) ? (
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

          {isActiveVisit && isAssignedTechnician && service.technicianAcceptanceStatus === 'PENDING' ? (
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

          {pendingCancellation ? (
            <div id="cancellation-request" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Cancellation requested</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {pendingCancellation.requestedBy.fullName}: {pendingCancellation.reason}
              </p>
              {paymentsTotal > 0 ? (
                <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  The customer has paid {formatNaira(paymentsTotal)}. Approving this cancellation also authorises a full refund of that amount — Finance then pays it and records it under Refunds.
                </p>
              ) : null}
              {isEligibleManager ? (
                <div className="mt-3 space-y-2">
                  <form action={approveVehicleServiceCancellationFormAction} className="space-y-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="serviceId" value={service.id} />
                    <input type="hidden" name="requestId" value={pendingCancellation.id} />
                    <input name="decisionNotes" placeholder="Notes (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                    <SubmitButton label="Approve cancellation" pendingLabel="Approving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                  </form>
                  <form action={declineVehicleServiceCancellationFormAction}>
                    <FormPendingOverlay />
                    <input type="hidden" name="serviceId" value={service.id} />
                    <input type="hidden" name="requestId" value={pendingCancellation.id} />
                    <SubmitButton label="Decline" pendingLabel="Declining…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                  </form>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Waiting on a Manager to approve or decline.</p>
              )}
            </div>
          ) : canRequestCancellation ? (
            <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text-muted)]">Request cancellation</summary>
              <form action={requestVehicleServiceCancellationFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <textarea id="vs-cancel-reason" name="reason" required rows={2} placeholder="Why should this Vehicle Service be cancelled?" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                <RefineTextButton targetId="vs-cancel-reason" />
                <p className="text-[11px] text-[var(--ejo-text-muted)]">
                  A Manager approves or declines it.{paymentsTotal > 0 ? ` ${formatNaira(paymentsTotal)} has been paid; approval authorises a full refund.` : ''} Cancelling also stops this vehicle&apos;s service reminders until its next completed service.
                </p>
                <SubmitButton label="Request cancellation" pendingLabel="Requesting…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
              </form>
            </details>
          ) : null}

          {service.status === 'CANCELLED' ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Cancelled</h2>
              {approvedCancellation ? (
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                  Approved by {approvedCancellation.decidedBy?.fullName ?? 'a Manager'}
                  {approvedCancellation.decidedAt ? ` on ${formatDateTime(approvedCancellation.decidedAt)}` : ''} — {approvedCancellation.reason}
                </p>
              ) : null}
              {service.collectedAt ? (
                <p className="mt-2 text-xs text-[var(--ejo-text)]">
                  Vehicle handed back to <span className="font-medium">{service.collectedByName ?? '—'}</span> on {formatDateTime(service.collectedAt)}.
                </p>
              ) : paymentsTotal - refundedTotal > 0.004 ? (
                <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  {formatNaira(paymentsTotal - refundedTotal)} must be refunded (see Refunds) before the vehicle can be handed back.
                </p>
              ) : (
                <form action={handBackCancelledVehicleServiceFormAction} className="mt-3 space-y-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="serviceId" value={service.id} />
                  <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">Hand the vehicle back — collected by (full name)</label>
                  <input name="collectedByName" required defaultValue={service.customer.fullName} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                  <SubmitButton label="Hand vehicle back" pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                </form>
              )}
            </div>
          ) : null}

          <RecycleBinPanel offer={binOffer} entity="VehicleService" id={service.id} />

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
              {service.completedAt ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Completed</dt>
                  <dd className="text-[var(--ejo-text)]">{formatDateTime(service.completedAt)}</dd>
                </div>
              ) : null}
              {service.readyForCollectionAt ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Ready for Collection</dt>
                  <dd className="text-[var(--ejo-text)]">{formatDateTime(service.readyForCollectionAt)}</dd>
                </div>
              ) : null}
              {service.closedAt ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Closed</dt>
                  <dd className="text-[var(--ejo-text)]">{formatDateTime(service.closedAt)}</dd>
                </div>
              ) : null}
              {service.collectedAt ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Checked Out</dt>
                  <dd className="text-[var(--ejo-text)]">
                    {formatDateTime(service.collectedAt)}
                    {service.collectedByName ? ` — collected by ${service.collectedByName}` : ''}
                  </dd>
                </div>
              ) : null}
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
              actionLabel: AUDIT_ACTION_LABEL[entry.action] ?? humanizeAction(entry.action),
              userName: actorLabel(entry.user?.fullName ?? null, entry.metadata),
              detail: formatAuditDetail(entry),
              dateLabel: formatDateTime(entry.createdAt),
            }))}
          />
        )}
      </div>
    </div>
  );
}
