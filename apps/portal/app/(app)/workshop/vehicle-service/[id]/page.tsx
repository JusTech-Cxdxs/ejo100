import { notFound } from 'next/navigation';
import { getVehicleService, getVehicleServiceAuditTrail } from '@/lib/actions/vehicle-service';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getServiceEstimate } from '@/lib/actions/vehicle-service-estimate';
import { cancelVehicleInspectionFormAction, completeVehicleInspectionFromServicePageFormAction } from '@/lib/actions/vehicle-inspection-form-handlers';
import {
  createServiceEstimateFormAction,
  cancelServiceEstimateFormAction,
  removeServiceEstimateLineItemFormAction,
  matchServiceEstimateStorePartLineFormAction,
  submitServiceEstimateFormAction,
  approveServiceEstimateFormAction,
} from '@/lib/actions/vehicle-service-estimate-form-handlers';
import { requestServiceEstimatePartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { getVehicleServicePayments } from '@/lib/actions/vehicle-service-payment';
import { recordServicePaymentFormAction } from '@/lib/actions/vehicle-service-payment-form-handlers';
import { listTechnicianCandidates, currentUserIsMasterAdmin, currentUserId, listEligibleFinanceOfficersForBranch } from '@/lib/actions/workshop';
import { listPartTypes, listPartCategories, listParts } from '@/lib/actions/store';
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
import { pluralize } from '@/lib/utils/pluralize';

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
  'service_estimate.line_store_matched': 'Estimate line matched to Store Part',
  'service_estimate.submitted': 'Estimate submitted for approval',
  'service_estimate.approved': 'Estimate approved',
  'service_estimate.cancelled': 'Estimate cancelled',
  'part_request_slip.requested': 'Parts requested from Store',
  'part_request_slip.hod_approved': 'Parts request approved by HOD',
  'part_request_slip.store_approved': 'Parts request approved by Store',
  'part_request_slip.released': 'Parts released',
  'part_request_slip.rejected': 'Parts request rejected',
  'payment.recorded': 'Payment recorded',
  'payment.approved': 'Deposit requirement met — work started',
};

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
    default:
      return null;
  }
}

export default async function VehicleServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editMileage?: string; error?: string; status?: string }>;
}) {
  const { editMileage, error, status } = await searchParams;
  const { id } = await params;
  const [service, isMasterAdmin, viewerId] = await Promise.all([
    getVehicleService(id),
    currentUserIsMasterAdmin(),
    currentUserId(),
  ]);
  if (!service) notFound();

  const isApprover = isMasterAdmin || service.supervisor?.id === viewerId;
  const isAssignedTechnician = isMasterAdmin || service.assignedTechnician?.id === viewerId;
  const nextAction = NEXT_ACTION[service.status];
  const canCancel = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const [technicians, auditTrail, inspection, serviceEstimate, partTypes, partCategories, parts, payments, eligibleFinance] = await Promise.all([
    listTechnicianCandidates(),
    getVehicleServiceAuditTrail(id),
    getVehicleInspection(id),
    getServiceEstimate(id),
    listPartTypes(service.branchId),
    listPartCategories(service.branchId),
    listParts(service.branchId),
    getVehicleServicePayments(id),
    listEligibleFinanceOfficersForBranch(service.branchId),
  ]);
  const partCategoriesWithTypes = partCategories.map((category: (typeof partCategories)[number]) => ({
    id: category.id,
    name: category.name,
    types: partTypes.filter((t: (typeof partTypes)[number]) => t.categoryId === category.id).map((t: (typeof partTypes)[number]) => ({ id: t.id, name: t.name, typicalUnit: t.typicalUnit })),
  }));
  const isEligibleFinance = isMasterAdmin || eligibleFinance.supervisors.some((m: { id: string }) => m.id === viewerId);
  const estimateTotal = (serviceEstimate?.lineItems ?? []).reduce((sum: number, li: { amount: unknown }) => sum + Number(li.amount ?? 0), 0);
  const paymentsTotal = payments.reduce((sum: number, p: (typeof payments)[number]) => sum + Number(p.amount ?? 0), 0);
  const minimumDeposit = Math.round(estimateTotal * MINIMUM_DEPOSIT_FRACTION * 100) / 100;
  const formatNaira = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
                      serviceEstimate.status === 'APPROVED'
                        ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                        : serviceEstimate.status === 'SUBMITTED'
                          ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                          : 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'
                    }`}
                  >
                    {serviceEstimate.status === 'APPROVED' ? 'Approved' : serviceEstimate.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}
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
              ) : serviceEstimate.status !== 'APPROVED' ? (
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
                          <th className="py-1.5 pr-2 font-medium">Description</th>
                          <th className="py-1.5 pr-2 font-medium">Type</th>
                          <th className="py-1.5 pr-2 font-medium">Qty</th>
                          <th className="py-1.5 pr-2 font-medium">Unit</th>
                          <th className="py-1.5 pr-2 font-medium">Unit Price</th>
                          <th className="py-1.5 pr-2 font-medium">Amount</th>
                          {serviceEstimate.status !== 'APPROVED' ? <th className="py-1.5" /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {serviceEstimate.lineItems.map((line: (typeof serviceEstimate.lineItems)[number]) => {
                          const quantity = Number(line.quantity);
                          const unitPrice = line.unitPrice != null ? Number(line.unitPrice) : null;
                          const amount = line.amount != null ? Number(line.amount) : unitPrice != null ? quantity * unitPrice : null;
                          const needsMatch = line.type === 'STORE_PART' && !line.matchedPartId;
                          return (
                            <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                              <td className="py-1.5 pr-2 text-[var(--ejo-text)]">{line.description}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{SERVICE_ESTIMATE_LINE_TYPE_DISPLAY[line.type] ?? line.type}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{quantity}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{line.unitOfMeasure ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text-muted)]">{unitPrice != null ? `₦${unitPrice.toLocaleString('en-NG')}` : needsMatch ? 'Awaiting match' : '—'}</td>
                              <td className="py-1.5 pr-2 text-[var(--ejo-text)]">{amount != null ? `₦${amount.toLocaleString('en-NG')}` : '—'}</td>
                              {serviceEstimate.status !== 'APPROVED' ? (
                                <td className="py-1.5">
                                  {needsMatch ? (
                                    <form action={matchServiceEstimateStorePartLineFormAction} className="flex items-center gap-1">
                                      <FormPendingOverlay />
                                      <input type="hidden" name="lineItemId" value={line.id} />
                                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                                      <select name="partId" required className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-1.5 py-1 text-[10px] text-[var(--ejo-text)]">
                                        <option value="">Match to Part…</option>
                                        {parts.map((p: (typeof parts)[number]) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                      <button type="submit" className="text-xs text-[var(--ejo-primary)] hover:underline">
                                        Match
                                      </button>
                                    </form>
                                  ) : (
                                    <form action={removeServiceEstimateLineItemFormAction}>
                                      <FormPendingOverlay />
                                      <input type="hidden" name="lineItemId" value={line.id} />
                                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                                      <button type="submit" className="text-xs text-[var(--ejo-error)] hover:underline">
                                        Remove
                                      </button>
                                    </form>
                                  )}
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

                  {serviceEstimate.status === 'DRAFT' ? (
                    <form action={submitServiceEstimateFormAction} className="mt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <SubmitButton
                        label="Submit Estimate"
                        pendingLabel="Submitting…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : serviceEstimate.status === 'SUBMITTED' ? (
                    <form action={approveServiceEstimateFormAction} className="mt-4">
                      <FormPendingOverlay />
                      <input type="hidden" name="estimateId" value={serviceEstimate.id} />
                      <input type="hidden" name="vehicleServiceId" value={service.id} />
                      <SubmitButton
                        label="Approve Estimate"
                        pendingLabel="Approving…"
                        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      />
                    </form>
                  ) : (
                    <div className="mt-4">
                      <p className="text-xs text-[var(--ejo-text-muted)]">
                        Approved by {serviceEstimate.approvedBy?.fullName ?? '—'}
                        {serviceEstimate.approvedAt ? ` on ${formatDateOnly(serviceEstimate.approvedAt)}` : ''}.
                      </p>
                      <form action={requestServiceEstimatePartRequestSlipFormAction} className="mt-3">
                        <FormPendingOverlay />
                        <input type="hidden" name="serviceEstimateId" value={serviceEstimate.id} />
                        <input type="hidden" name="vehicleServiceId" value={service.id} />
                        <SubmitButton
                          label="Request Store Parts"
                          pendingLabel="Requesting…"
                          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                        />
                      </form>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {serviceEstimate?.status === 'APPROVED' ? (
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
