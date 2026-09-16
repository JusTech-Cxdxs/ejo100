import { notFound } from 'next/navigation';
import { getVehicleService, getVehicleServiceAuditTrail } from '@/lib/actions/vehicle-service';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { cancelVehicleInspectionFormAction } from '@/lib/actions/vehicle-inspection-form-handlers';
import { listTechnicianCandidates, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import {
  updateVehicleServiceStatusFormAction,
  escalateVehicleServiceFormAction,
  approveVehicleServiceFormAction,
  rejectVehicleServiceFormAction,
  assignTechnicianToVehicleServiceFormAction,
  deleteVehicleServiceFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupervisorPicker } from '@/components/SupervisorPicker';
import { AuditTrail } from '@/components/AuditTrail';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';

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

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  SCHEDULED: { status: 'CHECKED_IN', label: 'Check In Vehicle' },
  CHECKED_IN: { status: 'IN_SERVICE', label: 'Start Service' },
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
  'vehicle_inspection.started': 'Inspection started',
  'vehicle_inspection.skipped': 'Inspection skipped',
  'vehicle_inspection.cancelled': 'Inspection cancelled',
  'vehicle_inspection.items_updated': 'Inspection items updated',
  'vehicle_inspection.completed': 'Inspection completed',
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
  const nextAction = NEXT_ACTION[service.status];
  const canCancel = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const canEscalate = !service.escalatedToJobCard && service.status !== 'COLLECTED' && service.status !== 'CANCELLED';
  const [technicians, auditTrail, inspection] = await Promise.all([listTechnicianCandidates(), getVehicleServiceAuditTrail(id), getVehicleInspection(id)]);

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

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{service.serviceNumber}</h1>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[service.status]}`}>
            {STATUS_LABEL[service.status]}
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
                  {[service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || '—'}
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
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.assignedTechnician?.fullName ?? 'Unassigned'}</dd>
              </div>
            </dl>
            {service.complaints.length > 0 ? (
              <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <p className="text-xs text-[var(--ejo-text-muted)]">Customer&apos;s Requests</p>
                <div className="mt-1 space-y-1">
                  {service.complaints.map((c: (typeof service.complaints)[number]) => (
                    <p key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                      <span className="text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span> {c.description}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
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
                <form action={cancelVehicleInspectionFormAction} className="mt-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="vehicleServiceId" value={service.id} />
                  <input type="hidden" name="redirectTo" value={`/workshop/vehicle-service/${service.id}/inspection`} />
                  <SubmitButton
                    label="Reopen — Inspect or Skip Again"
                    pendingLabel="Reopening…"
                    className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              </>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <LoadingLink
                  href={`/workshop/vehicle-service/${service.id}/inspection`}
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  View Inspection
                </LoadingLink>
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

          {canEscalate ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Found a Repair Job?</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                If the vehicle needs more than routine maintenance, send it to Job Card so the repair gets
                handled properly.
              </p>
              <form action={escalateVehicleServiceFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <SupervisorPicker vehicleType={service.vehicle.vehicleType} defaultSupervisorId={service.supervisor?.id} />
                <textarea
                  name="additionalComplaint"
                  rows={2}
                  placeholder="What did the technician actually find…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Escalate to Job Card"
                  pendingLabel="Escalating…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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
